def build_provenance(provider, model, issue_time_utc, api_url, generated_at,
                     units, present_vars, expected_vars):
    missing = [v for v in expected_vars if v not in present_vars]
    if not present_vars:
        status = "failed"
    elif missing:
        status = "partial"
    else:
        status = "ok"
    return {
        "provider": provider,
        "weather_model": model,
        "issue_time_utc": issue_time_utc,
        "api_url": api_url,
        "generated_at": generated_at,
        "units": dict(units),
        "retrieval_status": status,
        "missing_variables": missing,
    }
