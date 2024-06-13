select prepare_randomized_ids('playlist');


create type playlist_entry_type as enum ('event');

-- All fields should never be null.
create type playlist_entry as (
    -- The Opencast ID of this entry. Not a UUID.
    opencast_id bigint,

    type playlist_entry_type,

    -- The Opencast ID of the referenced content.
    content_id text
);

create table playlists (
    id bigint primary key default randomized_id('playlist'),
    opencast_id text not null unique,

    title text not null,
    description text,
    creator text,

    entries playlist_entry[] not null,

    read_roles text[] not null,
    write_roles text[] not null,

    updated timestamp with time zone not null,

    constraint read_roles_no_null_value check (array_position(read_roles, null) is null),
    constraint write_roles_no_null_value check (array_position(write_roles, null) is null),
    constraint entries_no_null_value check (array_position(entries, null) is null)
);


-- To perform queries like `write_roles && $1` on the whole table. Probably just
-- to list all playlists that a user has write access to.
create index idx_playlists_write_roles on playlists using gin (write_roles);


-- Search index ---------------------------------------------------------------

-- TODO

-- Adds the necessary type, column and constraints for playlist blocks.

-- The transaction adding the type needs to committed before it can be
-- used in this migration.
begin;
alter type block_type add value 'playlist';
commit;

alter table blocks
    add column playlist bigint references playlists on delete set null;

alter table blocks
    add constraint playlist_block_has_fields check (type <> 'playlist' or (
        videolist_order is not null and
        videolist_layout is not null and
        show_title is not null and
        show_metadata is not null
    ));

alter type video_list_order add value 'original';

create index idx_block_playlist on blocks (playlist);


-- All of this is the preparation to store playlists in the search index.
-- The procedure for playlists is very similar to the one for series, and
-- is adapted from `19-series-search-view` and `20-fix-queue-triggers`
-- (this includes some of the comments).

-- We need to change the 'kind' of things we can insert into the queue to
-- add 'playlists'. This needs to be committed before the type can be used
-- in this migration.
begin;
alter type search_index_item_kind add value 'playlist';
commit;


-- Add view for playlist data that we put into the search index.
create view search_playlists as
    select
        playlists.id, playlists.opencast_id,
        playlists.read_roles, playlists.write_roles,
        playlists.title, playlists.description, playlists.creator,
        coalesce(
            array_agg((
                -- Using a nested query here improves the overall performance
                -- for the main use case: 'where id = any(...)'. If we would
                -- use a join instead, the runtime would be the same with or
                -- without the 'where id' (roughly 300ms on my machine).
                select row(search_realms.*)::search_realms
                from search_realms
                where search_realms.id = blocks.realm
            )) filter(where blocks.realm is not null),
            '{}'
        ) as host_realms
    from playlists
    left join blocks on type = 'playlist' and blocks.playlist = playlists.id
    group by playlists.id;

-- Add a trigger to automatically add a playlist to the queue whenever it's changed
-- somehow.
create function queue_playlist_for_reindex() returns trigger language plpgsql as $$
begin
    insert into search_index_queue (item_id, kind)
    values (new.id, 'playlist')
    on conflict do nothing;
    return null;
end;
$$;

create trigger queue_touched_playlist_for_reindex
after insert or delete or update
on playlists
for each row
execute procedure queue_playlist_for_reindex();

-- Returns all series, events and playlists that are hosted by the given realm.
-- They are returned in the form that can be directly inserted into
-- `search_index_queue`.
-- In theory this should be renamed to reflect the fact that this now also
-- includes playlists. But since this is used in another function
-- (`queue_touched_realm_for_reindex()`), it's easier to stick with the
-- existing name.
create or replace function hosted_series_and_events(realm_id bigint)
    returns table (id bigint, kind search_index_item_kind)
    language 'sql'
as $$
    with
        the_blocks as (
            select *
            from blocks
            where blocks.realm = realm_id
        ),
        the_events as (
            select events.id, 'event'::search_index_item_kind
            from the_blocks
            inner join events on (
                type = 'series' and the_blocks.series = events.series
                or type = 'video' and the_blocks.video = events.id
            )
        ),
        the_series as (
            select series.id, 'series'::search_index_item_kind
            from the_blocks
            inner join series on type = 'series' and the_blocks.series = series.id
        ),
        the_playlists as (
            select playlists.id, 'playlist'::search_index_item_kind
            from the_blocks
            inner join playlists on type = 'playlist' and the_blocks.playlist = playlists.id
        )
    select * from the_events union all select * from the_series union all select * from the_playlists
$$;

