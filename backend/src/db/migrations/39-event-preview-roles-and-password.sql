-- Adds columns `preview_roles` and `credentials`.

-- Users with a preview role may only view text metadata of an event.
-- Any other action will require read or write roles (these imply preview rights).

-- `credentials` is an optional column which holds a user/group name and a corresponding
-- password. If set, users need these credentials to gain read access to an event.
create type credentials as (
    name text, -- as `<hash-type>:<hashed-username>`
    password text -- as `<hash-type>:<hashed-pw>`
);

alter table all_events
    add column credentials credentials,
    add column preview_roles text[] not null default '{}';

-- For convenience, all read roles are also copied over to preview roles.
-- Removing any roles from read will however _not_ remove them from preview, as they
-- might also have been added separately and we can't really account for that.
update all_events set preview_roles = read_roles;

create function sync_preview_roles()
returns trigger language plpgsql as $$
begin
    new.preview_roles := (
        select array_agg(distinct role) from unnest(new.preview_roles || new.read_roles) as role
    );
    return new;
end;
$$;

create trigger sync_preview_roles_on_change
before insert or update of read_roles, preview_roles on all_events
for each row
execute function sync_preview_roles();

-- replace outdated view to include preview_roles
create or replace view events as select * from all_events where tobira_deletion_timestamp is null;

-- add `preview_roles` to `search_events` view as well
drop view search_events;
create view search_events as
    select
        events.id, events.opencast_id, events.state,
        events.series, series.title as series_title,
        events.title, events.description, events.creators,
        events.thumbnail, events.duration,
        events.is_live, events.updated, events.created, events.start_time, events.end_time,
        events.read_roles, events.write_roles, events.preview_roles,
        coalesce(
            array_agg(
                distinct
                row(search_realms.*)::search_realms
            ) filter(where search_realms.id is not null),
            '{}'
        ) as host_realms,
        is_audio_only(events.tracks) as audio_only,
        coalesce(
            array_agg(playlists.id)
                filter(where playlists.id is not null),
            '{}'
        ) as containing_playlists,
        (
            select array_agg(t)
            from (
                select unnest(texts) as t
                from event_texts
                where event_id = events.id and ty = 'slide-text'
            ) as subquery
        ) as slide_texts,
        (
            select array_agg(t)
            from (
                select unnest(texts) as t
                from event_texts
                where event_id = events.id and ty = 'caption'
            ) as subquery
        ) as caption_texts,
        (events.credentials is not null) as has_password
    from all_events as events
    left join series on events.series = series.id
    -- This syntax instead of `foo = any(...)` to use the index, which is not
    -- otherwise used.
    left join playlists on array[events.opencast_id] <@ event_entry_ids(entries)
    left join blocks on (
        type = 'series' and blocks.series = events.series
        or type = 'video' and blocks.video = events.id
        or type = 'playlist' and blocks.playlist = playlists.id
    )
    left join search_realms on search_realms.id = blocks.realm
    group by events.id, series.id;