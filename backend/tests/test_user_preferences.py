"""P1-5: user preferences surface — the auto-advance toggle round-trips."""

from httpx import AsyncClient


async def test_auto_advance_defaults_off_and_round_trips(client: AsyncClient, auth_headers: dict):
    default = (await client.get("/api/v1/users/me/preferences", headers=auth_headers)).json()
    assert default["auto_advance_on_correct"] is False

    updated = (
        await client.put(
            "/api/v1/users/me/preferences",
            json={"auto_advance_on_correct": True},
            headers=auth_headers,
        )
    ).json()
    assert updated["auto_advance_on_correct"] is True

    # The committed row is read back on the next GET.
    again = (await client.get("/api/v1/users/me/preferences", headers=auth_headers)).json()
    assert again["auto_advance_on_correct"] is True

    # Flipping it back off persists False (False is not "unset").
    off = (
        await client.put(
            "/api/v1/users/me/preferences",
            json={"auto_advance_on_correct": False},
            headers=auth_headers,
        )
    ).json()
    assert off["auto_advance_on_correct"] is False


async def test_preferences_update_does_not_disturb_other_fields(client: AsyncClient, auth_headers: dict):
    await client.put(
        "/api/v1/users/me/preferences",
        json={"daily_goal_type": "minutes", "daily_goal_value": 30},
        headers=auth_headers,
    )
    resp = (
        await client.put(
            "/api/v1/users/me/preferences",
            json={"auto_advance_on_correct": True},
            headers=auth_headers,
        )
    ).json()
    assert resp["daily_goal_type"] == "minutes"
    assert resp["daily_goal_value"] == 30
    assert resp["auto_advance_on_correct"] is True
