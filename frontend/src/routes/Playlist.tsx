import { graphql, readInlineData, useFragment } from "react-relay";
import { useTranslation } from "react-i18next";
import { unreachable } from "@opencast/appkit";

import { loadQuery } from "../relay";
import { makeRoute } from "../rauta";
import { RootLoader } from "../layout/Root";
import { Nav } from "../layout/Navigation";
import { PageTitle } from "../layout/header/ui";
import { keyOfId, playlistId } from "../util";
import { NotFound } from "./NotFound";
import { b64regex } from "./util";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { PlaylistByOpencastIdQuery } from "./__generated__/PlaylistByOpencastIdQuery.graphql";
import { PlaylistRouteData$key } from "./__generated__/PlaylistRouteData.graphql";
import { PlaylistByIdQuery } from "./__generated__/PlaylistByIdQuery.graphql";
import { ErrorPage } from "../ui/error";
import { VideoListBlock, videoListEventFragment } from "../ui/Blocks/VideoList";
import { VideoListEventData$key } from "../ui/Blocks/__generated__/VideoListEventData.graphql";


export const DirectPlaylistOCRoute = makeRoute({
    url: ({ ocID }: { ocID: string }) => `/!p/:${ocID}`,
    match: url => {
        const regex = new RegExp("^/!p/:([^/]+)$", "u");
        const matches = regex.exec(url.pathname);

        if (!matches) {
            return null;
        }


        const opencastId = decodeURIComponent(matches[1]);
        const query = graphql`
            query PlaylistByOpencastIdQuery($id: String!) {
                ... UserData
                playlist: playlistByOpencastId(id: $id) { ...PlaylistRouteData }
                rootRealm { ... NavigationData }
            }
        `;
        const queryRef = loadQuery<PlaylistByOpencastIdQuery>(query, { id: opencastId });


        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={data => <Nav fragRef={data.rootRealm} />}
                render={result => <PlaylistPage playlistFrag={result.playlist} />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

export const DirectPlaylistRoute = makeRoute({
    url: ({ playlistId }: { playlistId: string }) => `/!p/${keyOfId(playlistId)}`,
    match: url => {
        const regex = new RegExp(`^/!p/(${b64regex}+)$`, "u");
        const matches = regex.exec(url.pathname);

        if (!matches) {
            return null;
        }


        const id = decodeURIComponent(matches[1]);
        const query = graphql`
            query PlaylistByIdQuery($id: ID!) {
                ... UserData
                playlist: playlistById(id: $id) { ...PlaylistRouteData }
                rootRealm { ... NavigationData }
            }
        `;
        const queryRef = loadQuery<PlaylistByIdQuery>(query, { id: playlistId(id) });


        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={data => <Nav fragRef={data.rootRealm} />}
                render={result => <PlaylistPage playlistFrag={result.playlist} />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const fragment = graphql`
    fragment PlaylistRouteData on Playlist {
        __typename
        ... on NotAllowed { dummy } # workaround
        ... on AuthorizedPlaylist {
            title
            description
            entries {
                __typename
                ...on AuthorizedEvent { id, ...VideoListEventData }
                ...on Missing { dummy }
                ...on NotAllowed { dummy }
            }
        }
    }
`;

type PlaylistPageProps = {
    playlistFrag?: PlaylistRouteData$key | null;
};

const PlaylistPage: React.FC<PlaylistPageProps> = ({ playlistFrag }) => {
    const { t } = useTranslation();
    const playlist = useFragment(fragment, playlistFrag ?? null);

    if (!playlist) {
        return <NotFound kind="playlist" />;
    }

    if (playlist.__typename === "NotAllowed") {
        return <ErrorPage title={t("api-remote-errors.view.playlist")} />;
    }
    if (playlist.__typename !== "AuthorizedPlaylist") {
        return unreachable();
    }

    const items = playlist.entries.map(entry => {
        if (entry.__typename === "AuthorizedEvent") {
            const out = readInlineData<VideoListEventData$key>(videoListEventFragment, entry);
            return out;
        } else if (entry.__typename === "Missing") {
            return "missing";
        } else if (entry.__typename === "NotAllowed") {
            return "unauthorized";
        } else {
            return unreachable();
        }
    });

    return <div css={{ display: "flex", flexDirection: "column" }}>
        <Breadcrumbs path={[]} tail={playlist.title} />
        <PageTitle title={playlist.title} />
        <p css={{ maxWidth: "90ch" }}>{playlist.description}</p>
        <div css={{ marginTop: 12 }}>
            <VideoListBlock
                allowOriginalOrder={true}
                initialOrder="ORIGINAL"
                title={t("videolist-block.videos.heading")}
                basePath="/!v"
                items={items}
            />
        </div>
    </div>;
};
