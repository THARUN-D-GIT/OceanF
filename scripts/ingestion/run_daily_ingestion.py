from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import xarray as xr

from copernicus_sources import (
    DOMAIN,
    GRID_RESOLUTION_DEG,
    HISTORY_DAYS,
    OCEANEMBED_FEATURE_ORDER,
)
from fetch_daily_inputs import build_requests, run_download


PROJECT_ROOT = Path(__file__).resolve().parents[2]
LIVE_PROCESSED_ROOT = PROJECT_ROOT / "data" / "processed" / "live"
LIVE_RAW_ROOT = PROJECT_ROOT / "data" / "raw" / "live"
STATUS_PATH = LIVE_PROCESSED_ROOT / "live_status.json"
HARMONIZE_SCRIPT = Path(__file__).with_name("harmonize_live_data.py")

REQUIRED_VARIABLES = OCEANEMBED_FEATURE_ORDER
EXPECTED_LATITUDE = np.arange(
    DOMAIN["lat_min"],
    DOMAIN["lat_max"] + GRID_RESOLUTION_DEG / 2,
    GRID_RESOLUTION_DEG,
)
EXPECTED_LONGITUDE = np.arange(
    DOMAIN["lon_min"],
    DOMAIN["lon_max"] + GRID_RESOLUTION_DEG / 2,
    GRID_RESOLUTION_DEG,
)

LOGGER = logging.getLogger("oceanembed.daily_ingestion")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch, harmonize, validate, and publish the next "
            "complete OceanEmbed retrospective input window."
        )
    )
    parser.add_argument(
        "--date",
        type=date.fromisoformat,
        help="Explicit Copernicus candidate date (YYYY-MM-DD).",
    )
    return parser.parse_args()


def parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def validate_harmonized_file(path: Path, target_date: date) -> list[str]:
    """Return validation errors without treating land NaNs as missing data."""
    errors: list[str] = []
    expected_days = [
        np.datetime64(target_date - timedelta(days=HISTORY_DAYS - 1) + timedelta(days=i))
        for i in range(HISTORY_DAYS)
    ]

    try:
        with xr.open_dataset(path) as dataset:
            missing = [name for name in REQUIRED_VARIABLES if name not in dataset.data_vars]
            if missing:
                errors.append(f"missing variables: {', '.join(missing)}")
                return errors

            if "time" not in dataset.coords:
                errors.append("missing time coordinate")
            else:
                actual_days = dataset.time.values.astype("datetime64[D]")
                if len(actual_days) != HISTORY_DAYS:
                    errors.append(
                        f"time axis has {len(actual_days)} days; expected {HISTORY_DAYS}"
                    )
                elif not np.array_equal(actual_days, np.asarray(expected_days)):
                    errors.append(
                        "time axis does not exactly cover "
                        f"{expected_days[0]} through {expected_days[-1]}"
                    )

            expected_coordinates = {
                "latitude": EXPECTED_LATITUDE,
                "longitude": EXPECTED_LONGITUDE,
            }
            for coordinate, expected in expected_coordinates.items():
                if coordinate not in dataset.coords:
                    errors.append(f"missing {coordinate} coordinate")
                    continue
                values = dataset[coordinate].values
                if not np.allclose(values, expected, atol=1e-6):
                    errors.append(
                        f"{coordinate} grid does not match the "
                        "5-30N / 45-105E 0.25-degree domain"
                    )

            for name in REQUIRED_VARIABLES:
                if name not in dataset.data_vars:
                    continue
                values = dataset[name].values
                if values.ndim != 3 or values.shape != (
                    HISTORY_DAYS,
                    len(EXPECTED_LATITUDE),
                    len(EXPECTED_LONGITUDE),
                ):
                    errors.append(
                        f"{name} dimensions {values.shape} do not match "
                        "the seven-day model input grid"
                    )
                    continue

                finite_per_day = np.isfinite(values).reshape(HISTORY_DAYS, -1).any(axis=1)
                for index, has_finite_data in enumerate(finite_per_day):
                    if not has_finite_data:
                        errors.append(
                            f"{name} has no valid finite values for "
                            f"{expected_days[index]}"
                        )
                if not dataset[name].attrs.get("units"):
                    errors.append(f"{name} is missing its units metadata")

            if str(dataset.attrs.get("target_date", "")) != target_date.isoformat():
                errors.append("target_date metadata does not match the requested date")
            if int(dataset.attrs.get("history_days", -1)) != HISTORY_DAYS:
                errors.append(f"history_days metadata must be {HISTORY_DAYS}")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        errors.append(f"cannot open or validate NetCDF: {exc}")

    return errors


def discover_latest_usable() -> date | None:
    candidates = sorted(
        LIVE_PROCESSED_ROOT.glob("????-??-??/oceanembed_live_*.nc"),
        reverse=True,
    )
    for path in candidates:
        target_date = parse_iso_date(path.parent.name)
        if target_date is None:
            continue
        errors = validate_harmonized_file(path, target_date)
        if errors:
            LOGGER.warning(
                "Ignoring unvalidated live dataset %s: %s",
                path,
                "; ".join(errors),
            )
            continue
        LOGGER.info("Latest validated local Copernicus date: %s", target_date)
        return target_date
    return None


def discover_candidate(latest_usable: date | None) -> date:
    if latest_usable is not None:
        return latest_usable + timedelta(days=1)

    raw_dates = sorted(
        (
            parsed
            for path in LIVE_RAW_ROOT.iterdir()
            if path.is_dir() and (parsed := parse_iso_date(path.name)) is not None
        )
    ) if LIVE_RAW_ROOT.is_dir() else []
    if raw_dates:
        LOGGER.info("Using latest actual raw-ingestion date as candidate: %s", raw_dates[-1])
        return raw_dates[-1]

    # With no local ingestion history, yesterday is only a fetch attempt;
    # readiness is determined exclusively by successful source and file validation.
    candidate = datetime.now(timezone.utc).date() - timedelta(days=1)
    LOGGER.info("No local live data found; attempting latest candidate date %s", candidate)
    return candidate


def write_status(
    latest_usable: date | None,
    candidate: date,
    message: str,
) -> None:
    window_start = (
        latest_usable - timedelta(days=HISTORY_DAYS - 1)
        if latest_usable is not None
        else None
    )
    payload = {
        "latestUsableDate": latest_usable.isoformat() if latest_usable else None,
        "inputWindowStart": window_start.isoformat() if window_start else None,
        "inputWindowEnd": latest_usable.isoformat() if latest_usable else None,
        "status": "READY" if latest_usable else "NOT_READY",
        "variablesReady": len(REQUIRED_VARIABLES) if latest_usable else 0,
        "requiredVariables": len(REQUIRED_VARIABLES),
        "readyVariables": list(REQUIRED_VARIABLES) if latest_usable else [],
        "ready": latest_usable is not None,
        "candidateDate": candidate.isoformat(),
        "lastChecked": datetime.now(timezone.utc).isoformat(),
        "message": message,
    }
    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = STATUS_PATH.with_suffix(".json.tmp")
    temporary_path.write_text(
        json.dumps(payload, indent=2) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary_path, STATUS_PATH)
    LOGGER.info("Availability status updated: %s", STATUS_PATH)


def run_script(script: Path, *arguments: str) -> None:
    subprocess.run(
        [sys.executable, str(script), *arguments],
        cwd=PROJECT_ROOT,
        check=True,
    )


def process_candidate(candidate: date) -> tuple[bool, str]:
    date_text = candidate.isoformat()
    LOGGER.info(
        "Attempting Copernicus inputs for %s through %s "
        "(retrospective %d-day window)",
        candidate - timedelta(days=HISTORY_DAYS - 1),
        candidate,
        HISTORY_DAYS,
    )
    raw_directory = LIVE_RAW_ROOT / date_text
    source_variables = {
        "sst": ("sst",),
        "sss": ("sss",),
        "sla": ("sla",),
        "currents": ("uo", "vo"),
        "winds": ("u_wind", "v_wind"),
    }
    failed_sources: list[str] = []
    for request in build_requests(candidate):
        try:
            # Refresh existing incomplete downloads so delayed feeds are retried.
            run_download(request, raw_directory, force=True)
        except (OSError, RuntimeError) as exc:
            variables = ", ".join(source_variables.get(request.name, (request.name,)))
            LOGGER.error(
                "Missing or incomplete variable(s) %s for %s: %s",
                variables,
                candidate,
                exc,
            )
            failed_sources.append(variables)

    if failed_sources:
        message = (
            f"Copernicus source download incomplete for {candidate}; "
            f"unavailable variables: {', '.join(failed_sources)}. "
            "The previous validated date remains latest usable."
        )
        LOGGER.error("%s", message)
        return False, message

    staging_directory = LIVE_PROCESSED_ROOT / date_text
    staging_directory.mkdir(parents=True, exist_ok=True)
    staging_path = staging_directory / f".oceanembed_live_{date_text}.staging.nc"
    published_path = staging_directory / f"oceanembed_live_{date_text}.nc"
    if staging_path.exists():
        staging_path.unlink()

    try:
        run_script(
            HARMONIZE_SCRIPT,
            "--date",
            date_text,
            "--output",
            str(staging_path),
        )
    except subprocess.CalledProcessError as exc:
        message = (
            f"Harmonization incomplete for {candidate}; inspect the logged "
            "variable/date error. The previous validated date remains latest usable."
        )
        LOGGER.error("%s Harmonizer exited with status %s.", message, exc.returncode)
        if staging_path.exists():
            staging_path.unlink()
        return False, message

    validation_errors = validate_harmonized_file(staging_path, candidate)
    if validation_errors:
        for error in validation_errors:
            LOGGER.error("Candidate %s validation failed: %s", candidate, error)
        staging_path.unlink(missing_ok=True)
        return False, (
            f"Harmonized input window for {candidate} failed validation; "
            "the previous validated date remains latest usable."
        )

    os.replace(staging_path, published_path)
    LOGGER.info("Published validated live dataset: %s", published_path)
    return True, f"Complete 7-day input window available for {candidate}"


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    args = parse_args()
    latest_usable = discover_latest_usable()
    candidate = args.date or discover_candidate(latest_usable)

    if latest_usable is not None and candidate <= latest_usable:
        LOGGER.info(
            "Candidate %s is already covered by validated live data through %s.",
            candidate,
            latest_usable,
        )
        write_status(
            latest_usable,
            candidate,
            f"Complete 7-day input window available through {latest_usable}",
        )
        return 0

    success, message = process_candidate(candidate)
    if success:
        latest_usable = candidate
    write_status(latest_usable, candidate, message)
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
