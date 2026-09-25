from __future__ import annotations

import logging
from datetime import date
from math import isfinite
from typing import Any

import torch

from app.config import settings
from app.data import (
    LIVE_DIR,
    LiveOceanEmbedDataLoader,
    OceanEmbedDataLoader,
)
from app.schemas import (
    DepthPrediction,
    PredictionRequest,
    PredictionResponse,
    SurfaceObservation,
)

from scripts.inference.oceanembed_inference import (
    DEPTHS_M,
    HISTORY_DAYS,
    INPUT_CHANNELS,
    INPUT_FEATURES,
    OUTPUT_CHANNELS,
    OceanEmbedEnsemble,
)


logger = logging.getLogger("oceanembed.model")


# ============================================================
# Frozen OceanEmbed V1 runtime contract
# ============================================================

INPUT_SIZE = 64
OUTPUT_SIZE = 32
GRID_RESOLUTION = 0.25
SURFACE_OBSERVATIONS = (
    ("sst", "SST", "°C"),
    ("sss", "SSS", "PSU"),
    ("sla", "SLA", "m"),
    ("uo", "U Current", "m/s"),
    ("vo", "V Current", "m/s"),
    ("u_wind", "U Wind", "m/s"),
    ("v_wind", "V Wind", "m/s"),
)


class OceanEmbedModel:
    """
    Backend wrapper around the real OceanEmbed V1 inference engine.

    Responsibilities:
    - Load the three-seed OceanEmbed ensemble.
    - Load and validate historical harmonized NetCDF datasets.
    - Detect and use live Copernicus-harmonized datasets when available.
    - Extract the real 7-day retrospective input window.
    - Run real OceanEmbed inference.
    - Return requested depth predictions at the requested location.
    """

    def __init__(self) -> None:
        self.engine: OceanEmbedEnsemble | None = None

        # Historical loader remains available as the fallback.
        self.data_loader: OceanEmbedDataLoader | None = None

        self.loaded: bool = False

        # Required by FastAPI /health.
        self.model_version: str = settings.model_version

        self.device: str = (
            "cuda" if torch.cuda.is_available() else "cpu"
        )

    # ========================================================
    # MODEL LOADING
    # ========================================================

    def load(self) -> None:
        """
        Load the real OceanEmbed V1 ensemble and
        historical harmonized datasets.
        """

        try:
            logger.info(
                "Loading OceanEmbed V1 model on %s...",
                self.device,
            )

            # ------------------------------------------------
            # Load the real three-seed ensemble.
            # ------------------------------------------------

            self.engine = OceanEmbedEnsemble(
                device=self.device
            )

            logger.info(
                "OceanEmbed V1 ensemble loaded successfully."
            )

            # ------------------------------------------------
            # Load historical datasets.
            #
            # These remain the fallback for historical dates.
            # ------------------------------------------------

            logger.info(
                "Loading historical OceanEmbed datasets..."
            )

            self.data_loader = OceanEmbedDataLoader()

            logger.info(
                "Historical OceanEmbed datasets loaded successfully."
            )

            # ------------------------------------------------
            # Validate frozen runtime contract.
            # ------------------------------------------------

            self._validate_runtime_contract()

            self.loaded = True

            logger.info(
                "OceanEmbed V1 backend model is ready."
            )

        except Exception:
            self.loaded = False

            logger.exception(
                "Failed to load OceanEmbed V1 backend model."
            )

            raise

    # ========================================================
    # RUNTIME CONTRACT VALIDATION
    # ========================================================

    def _validate_runtime_contract(self) -> None:
        """
        Validate the frozen OceanEmbed V1 inference contract.
        """

        if self.engine is None:
            raise RuntimeError(
                "OceanEmbed inference engine is not loaded."
            )

        if self.data_loader is None:
            raise RuntimeError(
                "OceanEmbed historical data loader is not loaded."
            )

        if HISTORY_DAYS != 7:
            raise RuntimeError(
                f"Expected 7-day history, got {HISTORY_DAYS}."
            )

        if len(INPUT_FEATURES) != 7:
            raise RuntimeError(
                "Expected exactly 7 input features."
            )

        if INPUT_CHANNELS != 49:
            raise RuntimeError(
                f"Expected 49 input channels, got {INPUT_CHANNELS}."
            )

        if OUTPUT_CHANNELS != 15:
            raise RuntimeError(
                f"Expected 15 output channels, got {OUTPUT_CHANNELS}."
            )

        if INPUT_SIZE != 64:
            raise RuntimeError(
                f"Expected 64x64 input tile, got {INPUT_SIZE}."
            )

        if OUTPUT_SIZE != 32:
            raise RuntimeError(
                f"Expected 32x32 output tile, got {OUTPUT_SIZE}."
            )

        if list(DEPTHS_M) != list(settings.depth_levels):
            raise RuntimeError(
                "Backend depth configuration does not match "
                "OceanEmbed V1 depth configuration."
            )

        logger.info(
            "Runtime contract validation passed."
        )

    # ========================================================
    # DATE HANDLING
    # ========================================================

    def _parse_request_date(
        self,
        request_date: date | str,
    ) -> date:
        """
        Normalize the request date.

        Pydantic converts PredictionRequest.date into a
        Python datetime.date object, but this method also
        accepts a string for direct/internal callers.
        """

        if isinstance(request_date, date):
            return request_date

        return date.fromisoformat(
            str(request_date)
        )

    # ========================================================
    # LIVE DATA DETECTION
    # ========================================================

    def _live_file_for_date(
        self,
        target_date: date,
    ):
        """
        Return the expected live harmonized NetCDF path.
        """

        return (
            LIVE_DIR
            / target_date.isoformat()
            / (
                f"oceanembed_live_"
                f"{target_date.isoformat()}.nc"
            )
        )

    # ========================================================
    # INPUT WINDOW SELECTION
    # ========================================================

    def _get_input_window(
        self,
        request: PredictionRequest,
    ):
        """
        Select the correct seven-day input source.

        Priority:
            1. Live Copernicus-harmonized dataset
            2. Historical OceanEmbed dataset

        Live file example:

        data/processed/live/2026-09-20/
            oceanembed_live_2026-09-20.nc
        """

        target_date = self._parse_request_date(
            request.date
        )

        live_file = self._live_file_for_date(
            target_date
        )

        # ----------------------------------------------------
        # LIVE PATH
        # ----------------------------------------------------

        if live_file.exists():

            logger.info(
                "Using LIVE OceanEmbed dataset: %s",
                live_file,
            )

            live_loader = None

            try:
                live_loader = LiveOceanEmbedDataLoader(
                    target_date
                )

                feature_arrays, metadata = (
                    live_loader.get_window(
                        latitude=request.latitude,
                        longitude=request.longitude,
                    )
                )

                # Make the source explicit for debugging,
                # API logging and frontend integration.
                metadata["source"] = "live"

                metadata["live_file"] = str(
                    live_file
                )

                return (
                    feature_arrays,
                    metadata,
                )

            finally:
                if live_loader is not None:
                    live_loader.close()

        # ----------------------------------------------------
        # HISTORICAL FALLBACK
        # ----------------------------------------------------

        if self.data_loader is None:
            raise RuntimeError(
                "Historical OceanEmbed data loader is unavailable."
            )

        logger.info(
            "Live dataset not found for %s. "
            "Using historical OceanEmbed dataset.",
            target_date.isoformat(),
        )

        feature_arrays, metadata = (
            self.data_loader.get_window(
                target_date=target_date,
                latitude=request.latitude,
                longitude=request.longitude,
            )
        )

        metadata["source"] = "historical"

        return (
            feature_arrays,
            metadata,
        )

    # ========================================================
    # PREDICTION
    # ========================================================

    def predict(
        self,
        request: PredictionRequest,
    ) -> PredictionResponse:
        """
        Run real OceanEmbed inference for one
        location/date request.
        """

        if not self.loaded:
            raise RuntimeError(
                "OceanEmbed V1 model is not loaded."
            )

        if self.engine is None:
            raise RuntimeError(
                "OceanEmbed inference engine is unavailable."
            )

        # ----------------------------------------------------
        # 1. Extract the real 7-day input window.
        #
        # This automatically chooses:
        #
        # LIVE:
        #   Copernicus-harmonized data
        #
        # OR
        #
        # HISTORICAL:
        #   Original training/test harmonized data
        # ----------------------------------------------------

        feature_arrays, metadata = (
            self._get_input_window(
                request
            )
        )

        # ----------------------------------------------------
        # 2. Validate feature ordering.
        # ----------------------------------------------------

        expected_features = tuple(
            INPUT_FEATURES
        )

        actual_features = tuple(
            feature_arrays.keys()
        )

        if actual_features != expected_features:
            raise RuntimeError(
                "Feature ordering mismatch. "
                f"Expected {expected_features}, "
                f"got {actual_features}."
            )

        # ----------------------------------------------------
        # 3. Validate every input shape.
        # ----------------------------------------------------

        expected_feature_shape = (
            HISTORY_DAYS,
            INPUT_SIZE,
            INPUT_SIZE,
        )

        for feature_name in expected_features:

            array = feature_arrays[
                feature_name
            ]

            if array.shape != expected_feature_shape:
                raise RuntimeError(
                    f"Unexpected shape for "
                    f"{feature_name}: "
                    f"{array.shape}. "
                    f"Expected "
                    f"{expected_feature_shape}."
                )

        # ----------------------------------------------------
        # 4. Run the real three-seed ensemble.
        # ----------------------------------------------------

        logger.info(
            "Running OceanEmbed inference for "
            "date=%s lat=%s lon=%s source=%s",
            request.date,
            request.latitude,
            request.longitude,
            metadata.get(
                "source",
                "unknown",
            ),
        )

        prediction, spread = (
            self.engine.predict_from_raw_window_with_spread(
                feature_arrays
            )
        )

        if not isinstance(prediction, torch.Tensor) or not isinstance(spread, torch.Tensor):
            raise RuntimeError(
                "OceanEmbed inference returned "
                "an unexpected type."
            )

        # ----------------------------------------------------
        # 5. Validate prediction shape.
        # ----------------------------------------------------

        expected_prediction_shape = (
            OUTPUT_CHANNELS,
            OUTPUT_SIZE,
            OUTPUT_SIZE,
        )

        if tuple(
            prediction.shape
        ) != expected_prediction_shape:

            raise RuntimeError(
                "Unexpected OceanEmbed prediction shape: "
                f"{tuple(prediction.shape)}. "
                f"Expected "
                f"{expected_prediction_shape}."
            )

        if tuple(spread.shape) != expected_prediction_shape:
            raise RuntimeError(
                "Unexpected OceanEmbed ensemble spread shape: "
                f"{tuple(spread.shape)}. "
                f"Expected {expected_prediction_shape}."
            )

        # ----------------------------------------------------
        # 6. Validate prediction values.
        # ----------------------------------------------------

        if not torch.isfinite(
            prediction
        ).all():

            raise RuntimeError(
                "OceanEmbed prediction contains "
                "non-finite values."
            )

        if not torch.isfinite(spread).all() or torch.any(spread < 0):
            raise RuntimeError(
                "OceanEmbed ensemble spread contains invalid values."
            )

        # ----------------------------------------------------
        # 7. Get requested output pixel.
        # ----------------------------------------------------

        output_row = int(
            metadata["output_row"]
        )

        output_col = int(
            metadata["output_col"]
        )

        if not (
            0 <= output_row < OUTPUT_SIZE
            and 0 <= output_col < OUTPUT_SIZE
        ):
            raise RuntimeError(
                "Invalid output location: "
                f"row={output_row}, "
                f"col={output_col}."
            )

        point_prediction = prediction[
            :,
            output_row,
            output_col,
        ]
        point_spread = spread[
            :,
            output_row,
            output_col,
        ]

        # ----------------------------------------------------
        # 8. Build requested depth response.
        # ----------------------------------------------------

        predictions: list[
            DepthPrediction
        ] = []

        for depth in request.depths:

            try:
                depth_index = list(
                    DEPTHS_M
                ).index(
                    depth
                )

            except ValueError as exc:

                raise ValueError(
                    f"Unsupported depth: {depth} m"
                ) from exc

            temperature = float(
                point_prediction[
                    depth_index
                ].item()
            )
            ensemble_spread = float(
                point_spread[depth_index].item()
            )

            predictions.append(
                DepthPrediction(
                    depth_m=depth,
                    temperature_c=temperature,
                    uncertainty_c=ensemble_spread,
                )
            )

        # Extract the final observation day at the exact input-grid
        # point corresponding to the requested output pixel.
        input_row = output_row + 16
        input_col = output_col + 16
        surface_observations: list[SurfaceObservation] = []
        for feature, label, unit in SURFACE_OBSERVATIONS:
            raw_value = float(
                feature_arrays[feature][-1, input_row, input_col]
            )
            surface_observations.append(
                SurfaceObservation(
                    variable=label,
                    value=raw_value if isfinite(raw_value) else None,
                    unit=unit,
                )
            )

        snapped_latitude = float(
            metadata[
                "snapped_latitude"
            ]
        )

        snapped_longitude = float(
            metadata[
                "snapped_longitude"
            ]
        )

        return PredictionResponse(
            latitude=snapped_latitude,
            longitude=snapped_longitude,
            date=request.date,
            input_window_start=date.fromisoformat(
                str(metadata["window_start"])
            ),
            input_window_end=date.fromisoformat(
                str(metadata["window_end"])
            ),
            model_version=self.model_version,
            grid_resolution=GRID_RESOLUTION,
            predictions=predictions,
            surface_observations=surface_observations,
        )

    # ========================================================
    # MODEL INFORMATION
    # ========================================================

    def get_model_info(
        self,
    ) -> dict[str, Any]:
        """
        Return OceanEmbed V1 model metadata.
        """

        if self.engine is None:
            raise RuntimeError(
                "OceanEmbed V1 model is not loaded."
            )

        info = self.engine.get_model_info()

        info[
            "model_version"
        ] = self.model_version

        info[
            "model_loaded"
        ] = self.loaded

        info[
            "runtime_device"
        ] = self.device

        info[
            "grid_resolution"
        ] = GRID_RESOLUTION

        info[
            "live_inference_enabled"
        ] = True

        return info

    # ========================================================
    # CLOSE / CLEANUP
    # ========================================================

    def close(self) -> None:
        """
        Release model and dataset resources.
        """

        self.loaded = False

        self.engine = None

        if self.data_loader is not None:

            try:
                self.data_loader.close()

            except Exception:
                logger.exception(
                    "Failed to close OceanEmbed "
                    "data loader cleanly."
                )

        self.data_loader = None


# ============================================================
# GLOBAL MODEL INSTANCE
# ============================================================

model = OceanEmbedModel()