from app.models.channel import Channel
from app.models.video import Video, VideoStatus
from app.services.channel_service import get_channel_detail, list_public_channels


async def test_channel_totals_exclude_unpublished_and_do_not_depend_on_page(db_session):
    channel = Channel(name="Learning", slug="learning-totals", is_visible=True)
    db_session.add(channel)
    await db_session.flush()
    for count, published in [(0, True), (12000, True), (800, True), (99999, False)]:
        db_session.add(
            Video(
                title="Real clip",
                source_url="https://example.com/clip",
                channel_ref=channel.id,
                status=VideoStatus.ready,
                is_official=True,
                is_published=published,
                view_count=count,
            )
        )
    await db_session.commit()
    listing = await list_public_channels(db_session, 1, 50)
    assert listing["items"][0]["total_view_count"] == 12800
    detail = await get_channel_detail(db_session, channel.slug, 1, 1)
    assert detail["channel"]["total_view_count"] == 12800
    assert detail["channel"]["subscriber_count"] == 0
    assert len(detail["videos"]["items"]) == 1
