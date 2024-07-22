-- Adds a query to check if any playlist block contains the searched event.

create or replace view search_events as
select
    events.id, events.state,
    events.series, series.title as series_title,
    events.title, events.description, events.creators,
    events.thumbnail, events.duration,
    events.is_live, events.created, events.start_time, events.end_time,
    events.read_roles, events.write_roles,
    coalesce(
        array_agg(
            distinct row(search_realms.*)::search_realms
        ) filter (where search_realms.id is not null),
        '{}'
    ) as host_realms,
    (
        select not exists (
            select from unnest(e.tracks) as t where t.resolution is not null
        ) from events e where e.id = events.id
    ) as audio_only
from events
left join series on events.series = series.id
left join blocks on (
    type = 'series' and blocks.series = events.series
    or type = 'video' and blocks.video = events.id
    or type = 'playlist' and blocks.playlist = any(
        select id from playlists where events.opencast_id = any(
            array(select content_id from unnest(entries))
        )
    )
)
left join search_realms on search_realms.id = blocks.realm
group by
    events.id, series.id, events.state,
    events.series, series_title,
    events.title, events.description, events.creators,
    events.thumbnail, events.duration,
    events.is_live, events.created, events.start_time, events.end_time,
    events.read_roles, events.write_roles;

create or replace function queue_block_for_reindex(block blocks)
   returns void
   language sql
as $$
    with
        -- The series that's involved: either via series block directly or the
        -- one of the video (which could be null).
        the_series(id) as (
            select series from events where id = block.video and series is not null
            union all select block.series where block.series is not null
        ),
        listed_events as (
            select id from events where id = block.video
            union all select events.id
                from the_series
                inner join events on events.series = the_series.id
            union all select events.id
                from events
                join playlists on playlists.id = block.playlist
                where events.opencast_id = any(
                    select content_id from unnest(playlists.entries)
                )
        ),
        new_entries(id, kind) as (
            select id, 'series'::search_index_item_kind from the_series
            union all select id, 'event'::search_index_item_kind from listed_events
        )
    insert into search_index_queue (item_id, kind)
    select id, kind from new_entries
    on conflict do nothing;
$$;

create or replace function queue_touched_playlist_block_for_reindex()
   returns trigger
   language plpgsql
as $$
declare
    block blocks;
begin
    if tg_op <> 'INSERT' then
        for block in (select * from blocks where playlist = OLD.id) loop
            perform queue_block_for_reindex(block);
        end loop;
    end if;
    
    if tg_op <> 'DELETE' then
        for block in (select * from blocks where playlist = NEW.id) loop
            perform queue_block_for_reindex(block);
        end loop;
    end if;

    return null;
end;
$$;

create trigger queue_touched_playlist_block_for_reindex
after insert or delete or update
on playlists
for each row
execute procedure queue_touched_playlist_block_for_reindex();
