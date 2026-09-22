from __future__ import annotations

import logging
from typing import Any

import torch

from app.config import settings
from app.data import OceanEmbedDataLoader
from app.schemas import (
    DepthPrediction,
    PredictionRequest,
    PredictionResponse,
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


class OceanEmbedModel:
    """
    Backend wrapper around the real OceanEmbed V1 inference engine.

    Responsibilities:
    - Load the three-seed OceanEmbed ensemble.
    - Load and validate harmonized NetCDF datasets.
    - Extract the real 7-day retrospective input window.
    - Run real OceanEmbed inference.
    - Return requested depth predictions at the requested location.
    """

    def __init__(self) -> None:
        self.engine: OceanEmbedEnsemble | None = None
        self.data_loader: OceanEmbedDataLoader | None = None

        self.loaded: bool = False

        # Required by FastAPI /health.
        self.model_version: str = settings.model_version

        self.device: str = (
            "cuda" if torch.cuda.is_available() else "cpu"
        )

    def load(self) -> None:
        """
        Load the real OceanEmbed V1 ensemble and harmonized datasets.
        """

        try:
            logger.info(
                "Loading OceanEmbed V1 model on %s...",
                self.device,
            )

            self.engine = OceanEmbedEnsemble(
                device=self.device
            )

            logger.info(
                "OceanEmbed V1 ensemble loaded successfully."
            )

            logger.info(
                "Loading harmonized OceanEmbed datasets..."
            )

            self.data_loader = OceanEmbedDataLoader()

            logger.info(
                "Harmonized OceanEmbed datasets loaded successfully."
            )

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
                "OceanEmbed data loader is not loaded."
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

    def predict(
        self,
        request: PredictionRequest,
    ) -> PredictionResponse:
        """
        Run real OceanEmbed inference for one location/date request.
        """

        if not self.loaded:
            raise RuntimeError(
                "OceanEmbed V1 model is not loaded."
            )

        if self.engine is None:
            raise RuntimeError(
                "OceanEmbed inference engine is unavailable."
            )

        if self.data_loader is None:
            raise RuntimeError(
                "OceanEmbed data loader is unavailable."
            )

        # --------------------------------------------------------
        # 1. Extract the real 7-day input window.
        #
        # get_window() returns:
        #
        #     (features, metadata)
        #
        # features:
        #     sst     -> (7,64,64)
        #     sss     -> (7,64,64)
        #     sla     -> (7,64,64)
        #     uo      -> (7,64,64)
        #     vo      -> (7,64,64)
        #     u_wind  -> (7,64,64)
        #     v_wind  -> (7,64,64)
        # --------------------------------------------------------

        feature_arrays, metadata = self.data_loader.get_window(
            target_date=request.date,
            latitude=request.latitude,
            longitude=request.longitude,
        )

        # --------------------------------------------------------
        # 2. Validate feature contract.
        # --------------------------------------------------------

        expected_features = tuple(INPUT_FEATURES)
        actual_features = tuple(feature_arrays.keys())

        if actual_features != expected_features:
            raise RuntimeError(
                "Feature ordering mismatch. "
                f"Expected {expected_features}, "
                f"got {actual_features}."
            )

        for feature_name in expected_features:
            array = feature_arrays[feature_name]

            expected_feature_shape = (
                HISTORY_DAYS,
                INPUT_SIZE,
                INPUT_SIZE,
            )

            if array.shape != expected_feature_shape:
                raise RuntimeError(
                    f"Unexpected shape for {feature_name}: "
                    f"{array.shape}. "
                    f"Expected {expected_feature_shape}."
                )

        # --------------------------------------------------------
        # 3. Run the real three-seed OceanEmbed ensemble.
        # --------------------------------------------------------

        prediction = self.engine.predict_from_raw_window(
            feature_arrays
        )

        if not isinstance(prediction, torch.Tensor):
            raise RuntimeError(
                "OceanEmbed inference returned an unexpected type."
            )

        expected_prediction_shape = (
            OUTPUT_CHANNELS,
            OUTPUT_SIZE,
            OUTPUT_SIZE,
        )

        if tuple(prediction.shape) != expected_prediction_shape:
            raise RuntimeError(
                "Unexpected OceanEmbed prediction shape: "
                f"{tuple(prediction.shape)}. "
                f"Expected {expected_prediction_shape}."
            )

        if not torch.isfinite(prediction).all():
            raise RuntimeError(
                "OceanEmbed prediction contains non-finite values."
            )

        # --------------------------------------------------------
        # 4. Select the requested geographic point.
        # --------------------------------------------------------

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

        # --------------------------------------------------------
        # 5. Build requested depth response.
        # --------------------------------------------------------

        predictions: list[DepthPrediction] = []

        for depth in request.depths:

            try:
                depth_index = list(DEPTHS_M).index(
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

            predictions.append(
                DepthPrediction(
                    depth_m=depth,
                    temperature_c=temperature,
                    uncertainty_c=None,
                )
            )

        # --------------------------------------------------------
        # 6. Return snapped grid coordinates.
        #
        # Grid resolution is part of the frozen OceanEmbed
        # scientific contract, so it is intentionally not read
        # from Settings.
        # --------------------------------------------------------

        return PredictionResponse(
            latitude=float(
                metadata["snapped_latitude"]
            ),
            longitude=float(
                metadata["snapped_longitude"]
            ),
            date=request.date,
            model_version=self.model_version,
            grid_resolution=GRID_RESOLUTION,
            predictions=predictions,
        )

    def get_model_info(self) -> dict[str, Any]:
        """
        Return OceanEmbed V1 model metadata.
        """

        if self.engine is None:
            raise RuntimeError(
                "OceanEmbed V1 model is not loaded."
            )

        info = self.engine.get_model_info()

        info["model_version"] = self.model_version
        info["model_loaded"] = self.loaded
        info["runtime_device"] = self.device
        info["grid_resolution"] = GRID_RESOLUTION

        return info

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
                    "Failed to close OceanEmbed data loader cleanly."
                )

        self.data_loader = None


model = OceanEmbedModel()