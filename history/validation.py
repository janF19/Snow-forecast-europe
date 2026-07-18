from .config import SCHEMA_VERSION


REQUIRED_METADATA = ("schema_version", "snowfall_term", "record_period", "resort_count")


def validate_records(records):
    if "_metadata" not in records:
        raise ValueError("missing _metadata")
    if "resorts" not in records:
        raise ValueError("missing resorts")
    meta = records["_metadata"]
    for field in REQUIRED_METADATA:
        if field not in meta:
            raise ValueError(f"missing metadata field: {field}")
    for resort, data in records["resorts"].items():
        if not isinstance(data.get("elevation"), int):
            raise ValueError(f"non-integer elevation: {resort}")
        if not data.get("seasons"):
            raise ValueError(f"no seasons for resort: {resort}")
    return records
