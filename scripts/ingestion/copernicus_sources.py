"""
OceanEmbed Copernicus Marine source configuration.

This module defines the external data sources required to build
the OceanEmbed 7-day surface-observation input window.

It does NOT download data.

The ingestion system will later use this configuration to:
    1. Discover available datasets.
    2. Determine actual temporal coverage.
    3. Download only missing daily data.
    4. Run quality control.
    5. Harmonize data to the OceanEmbed 0.25° grid.
"""

from dataclasses import dataclass
from typing import Optional


# ============================================================
# OceanEmbed canonical configuration
# ============================================================

DOMAIN = {
    "lat_min": 5.0,
    "lat_max": 30.0,
    "lon_min": 45.0,
    "lon_max": 105.0,
}

GRID_RESOLUTION_DEG = 0.25

GRID_NLAT = 101
GRID_NLON = 241

HISTORY_DAYS = 7


# ============================================================
# Copernicus source definition
# ============================================================

@dataclass(frozen=True)
class CopernicusSource:
    """
    Metadata describing one Copernicus Marine data source.
    """

    name: str

    feature_names: tuple[str, ...]

    product_id: str

    dataset_id: Optional[str]

    variable_names: tuple[str, ...]

    native_resolution_deg: Optional[float]

    temporal_resolution: str

    source_type: str

    notes: str = ""


# ============================================================
# Operational source catalogue
# ============================================================

SOURCES = {

    # --------------------------------------------------------
    # Sea Surface Temperature
    # --------------------------------------------------------

    "sst": CopernicusSource(
        name="Sea Surface Temperature",

        feature_names=(
            "sst",
        ),

        product_id="SST_GLO_PHY_L4_NRT_010_005",

        dataset_id="cmems_obs-sst_glo_phy-temp_nrt_P1D-m",

        variable_names=(
            "analysed_sst",
        ),

        native_resolution_deg=0.25,

        temporal_resolution="daily",

        source_type="NRT satellite multi-product SST",

        notes=(
            "Global Level-4 near-real-time SST. "
            "Data will be harmonized to the OceanEmbed "
            "0.25 degree canonical grid."
        ),
    ),


    # --------------------------------------------------------
    # Sea Surface Salinity
    # --------------------------------------------------------

    "sss": CopernicusSource(
        name="Sea Surface Salinity",

        feature_names=(
            "sss",
        ),

        product_id="GLOBAL_ANALYSISFORECAST_PHY_001_024",

        dataset_id="cmems_mod_glo_phy-so_anfc_0.083deg_P1D-m",

        variable_names=(
            "so",
        ),

        native_resolution_deg=0.083,

        temporal_resolution="daily",

        source_type="Copernicus ocean analysis/forecast",

        notes=(
            "Daily global ocean analysis/forecast salinity. "
            "The surface OceanEmbed SSS feature uses the "
            "uppermost model level at approximately 0.494 m. "
            "The native approximately 0.083 degree grid is "
            "harmonized to the OceanEmbed 0.25 degree "
            "canonical grid."
        ),
    ),


    # --------------------------------------------------------
    # Sea Level Anomaly
    # --------------------------------------------------------

    "sla": CopernicusSource(
        name="Sea Level Anomaly",

        feature_names=(
            "sla",
        ),

        product_id="SEALEVEL_GLO_PHY_L4_NRT_008_046",

        dataset_id=(
            "cmems_obs-sl_glo_phy-ssh_nrt_"
            "allsat-l4-duacs-0.125deg_P1D"
        ),

        variable_names=(
            "sla",
        ),

        native_resolution_deg=0.125,

        temporal_resolution="daily",

        source_type="NRT satellite altimetry",

        notes=(
            "Global Level-4 near-real-time sea-level "
            "anomaly product."
        ),
    ),


    # --------------------------------------------------------
    # Surface Ocean Currents
    # --------------------------------------------------------

    "currents": CopernicusSource(
        name="Surface Ocean Currents",

        feature_names=(
            "uo",
            "vo",
        ),

        product_id="MULTIOBS_GLO_PHY_MYNRT_015_003",

        dataset_id=(
            "cmems_obs-mob_glo_phy-cur_"
            "nrt_0.25deg_P1D-m"
        ),

        variable_names=(
            "uo",
            "vo",
        ),

        native_resolution_deg=0.25,

        temporal_resolution="daily",

        source_type="NRT total surface current",

        notes=(
            "Daily zonal and meridional surface-current "
            "components."
        ),
    ),


    # --------------------------------------------------------
    # Surface Winds
    # --------------------------------------------------------

    "winds": CopernicusSource(
        name="Surface Winds",

        feature_names=(
            "u_wind",
            "v_wind",
        ),

        product_id="WIND_GLO_PHY_L4_NRT_012_004",

        dataset_id=(
            "cmems_obs-wind_glo_phy_nrt_l4_"
            "0.125deg_PT1H"
        ),

        variable_names=(
            "eastward_wind",
            "northward_wind",
        ),

        native_resolution_deg=0.125,

        temporal_resolution="hourly",

        source_type="NRT L4 surface wind",

        notes=(
            "Hourly global Level-4 near-real-time "
            "surface wind product. "
            "The ingestion layer will create the "
            "daily representation required by OceanEmbed."
        ),
    ),
}


# ============================================================
# Required OceanEmbed feature order
# ============================================================

OCEANEMBED_FEATURE_ORDER = (
    "sst",
    "sss",
    "sla",
    "uo",
    "vo",
    "u_wind",
    "v_wind",
)


# ============================================================
# Source lookup helpers
# ============================================================

def get_source(name: str) -> CopernicusSource:
    """
    Return a configured Copernicus source.

    Raises:
        KeyError: if the source does not exist.
    """

    if name not in SOURCES:
        raise KeyError(
            f"Unknown OceanEmbed source: {name}. "
            f"Available sources: {', '.join(SOURCES)}"
        )

    return SOURCES[name]


def get_all_sources() -> tuple[CopernicusSource, ...]:
    """
    Return all configured source definitions.
    """

    return tuple(SOURCES.values())


def get_required_sources() -> tuple[CopernicusSource, ...]:
    """
    Return all sources required to construct one
    OceanEmbed input sample.
    """

    return (
        SOURCES["sst"],
        SOURCES["sss"],
        SOURCES["sla"],
        SOURCES["currents"],
        SOURCES["winds"],
    )


# ============================================================
# Static configuration validation
# ============================================================

def validate_source_configuration() -> None:
    """
    Validate the static source configuration.

    This function does not contact Copernicus.
    """

    required_groups = {
        "sst",
        "sss",
        "sla",
        "currents",
        "winds",
    }

    configured_groups = set(SOURCES.keys())

    missing_groups = required_groups - configured_groups

    if missing_groups:
        raise ValueError(
            "Missing Copernicus source groups: "
            + ", ".join(sorted(missing_groups))
        )

    configured_features = []

    for source in SOURCES.values():

        if not source.product_id:
            raise ValueError(
                f"Missing product ID for source: {source.name}"
            )

        if not source.variable_names:
            raise ValueError(
                f"Missing variable mapping for source: {source.name}"
            )

        if (
            source.native_resolution_deg is not None
            and source.native_resolution_deg <= 0
        ):
            raise ValueError(
                f"Invalid native resolution for source: "
                f"{source.name}"
            )

        configured_features.extend(
            source.feature_names
        )

    if tuple(configured_features) != OCEANEMBED_FEATURE_ORDER:
        raise ValueError(
            "OceanEmbed feature order mismatch.\n"
            f"Expected: {OCEANEMBED_FEATURE_ORDER}\n"
            f"Configured: {tuple(configured_features)}"
        )

    if GRID_RESOLUTION_DEG != 0.25:
        raise ValueError(
            "OceanEmbed canonical resolution must remain "
            "0.25 degree."
        )

    if GRID_NLAT != 101 or GRID_NLON != 241:
        raise ValueError(
            "OceanEmbed canonical grid must remain 101 x 241."
        )


# ============================================================
# Human-readable source summary
# ============================================================

def print_source_summary() -> None:
    """
    Print the configured source catalogue.
    """

    print("=" * 80)
    print("OceanEmbed Copernicus Source Configuration")
    print("=" * 80)

    print(
        f"Domain: "
        f"{DOMAIN['lat_min']}..{DOMAIN['lat_max']} N, "
        f"{DOMAIN['lon_min']}..{DOMAIN['lon_max']} E"
    )

    print(
        f"Canonical grid: "
        f"{GRID_RESOLUTION_DEG} degree "
        f"({GRID_NLAT} x {GRID_NLON})"
    )

    print(
        f"Input history: {HISTORY_DAYS} days"
    )

    print()

    for key, source in SOURCES.items():

        print(f"[{key}]")

        print(
            f"  Name       : {source.name}"
        )

        print(
            f"  Product ID : {source.product_id}"
        )

        print(
            f"  Dataset ID : "
            f"{source.dataset_id or 'NOT YET RESOLVED'}"
        )

        print(
            f"  Variables  : "
            f"{', '.join(source.variable_names)}"
        )

        print(
            f"  Features   : "
            f"{', '.join(source.feature_names)}"
        )

        if source.native_resolution_deg is not None:
            print(
                f"  Resolution : "
                f"{source.native_resolution_deg} degree"
            )
        else:
            print(
                "  Resolution : unknown"
            )

        print(
            f"  Frequency  : "
            f"{source.temporal_resolution}"
        )

        print(
            f"  Source     : "
            f"{source.source_type}"
        )

        if source.notes:
            print(
                f"  Notes      : "
                f"{source.notes}"
            )

        print()

    print("=" * 80)


# ============================================================
# Script entry point
# ============================================================

if __name__ == "__main__":

    validate_source_configuration()

    print_source_summary()