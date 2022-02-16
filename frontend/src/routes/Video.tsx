import React from "react";
import { graphql } from "react-relay/hooks";

import type { VideoQuery, VideoQueryResponse } from "./__generated__/VideoQuery.graphql";
import { loadQuery } from "../relay";
import { RootLoader } from "../layout/Root";
import { NotFound } from "./NotFound";
import { Nav } from "../layout/Navigation";
import { TextBlock } from "../ui/Blocks/Text";
import { Player, Track } from "../ui/player";
import { useTranslation } from "react-i18next";
import { useTitle } from "../util";
import { SeriesBlockFromSeries } from "../ui/Blocks/Series";
import { makeRoute, MatchedRoute } from "../rauta";
import { Link } from "../router";
import { FiChevronRight } from "react-icons/fi";
import { isValidPathSegment } from "./Realm";


export const b64regex = "[a-zA-Z0-9\\-_]";

export const VideoRoute = makeRoute(url => {
    const urlPath = decodeURI(url.pathname).replace(/^\//, "").replace(/\/$/, "");
    const parts = urlPath.split("/");
    if (parts.length < 2) {
        return null;
    }
    if (parts[parts.length - 2] !== "v") {
        return null;
    }
    const videoId = parts[parts.length - 1];
    if (!videoId.match(b64regex)) {
        return null;
    }

    const realmPathParts = parts.slice(0, parts.length - 2);
    for (const segment of realmPathParts) {
        if (!isValidPathSegment(segment)) {
            return null;
        }
    }

    const realmPath = "/" + realmPathParts.join("/");
    return prepare(`ev${videoId}`, realmPath);
});

export const DirectVideoRoute = makeRoute(url => {
    const regex = new RegExp(`^/!(${b64regex}+)/?$`, "u");
    const params = regex.exec(decodeURI(url.pathname));
    if (params === null) {
        return null;
    }

    const videoId = params[1];
    return prepare(`ev${videoId}`, "/");
});

const prepare = (id: string, realmPath: string): MatchedRoute => {
    const queryRef = loadQuery<VideoQuery>(query, { id, realmPath });

    return {
        render: () => <RootLoader
            {... { query, queryRef }}
            nav={data => data.realm ? <Nav fragRef={data.realm} /> : []}
            render={result => {
                const { event, realm } = result;

                // TODO: this realm check is useless once we check a video belongs to a realm.
                return !event || !realm
                    ? <NotFound kind="video" />
                    : <VideoPage {...{ event, realmPath, id }} />;
            }}
        />,
        dispose: () => queryRef.dispose(),
    };
};


const query = graphql`
    query VideoQuery($id: ID!, $realmPath: String!) {
        ... UserData
        event(id: $id) {
            title
            description
            creator
            created
            updated
            duration
            canWrite
            series { title, ...SeriesBlockSeriesData }
            tracks { uri flavor mimetype resolution }
        }
        realm: realmByPath(path: $realmPath) {
            ... NavigationData
        }
    }
`;

type Props = {
    event: NonNullable<VideoQueryResponse["event"]>;
    realmPath: string;
    id: string;
};

const VideoPage: React.FC<Props> = ({ event, realmPath, id }) => {
    const { t, i18n } = useTranslation();

    const createdDate = new Date(event.created);
    const created = createdDate.toLocaleString(i18n.language);

    // If the event was updated only shortly after the creation date, we don't
    // want to show it.
    const updatedDate = new Date(event.updated);
    const updated = updatedDate.getTime() - createdDate.getTime() > 5 * 60 * 1000
        ? updatedDate.toLocaleString(i18n.language)
        : null;

    const { title, tracks, description } = event;
    const duration = event.duration ?? 0; // <-- TODO
    useTitle(title);
    return <>
        <Player tracks={tracks as Track[]} title={title} duration={duration} />
        <h1 css={{ marginTop: 24, fontSize: 24 }}>{title}</h1>
        {description !== null && <TextBlock content={description} />}
        <table css={{
            marginBottom: 16,
            "& tr": {
                "& > td:first-child": {
                    color: "var(--grey40)",
                    paddingRight: 32,
                },
            },
        }}>
            <tbody>
                <MetaDatum label={t("video.creator")} value={event.creator} />
                <MetaDatum label={t("video.created")} value={created} />
                <MetaDatum label={t("video.updated")} value={updated} />
                <MetaDatum label={t("video.part-of-series")} value={event.series?.title} />
            </tbody>
        </table>

        {event.canWrite && (
            <Link
                to={`/~manage/videos/${id.slice(2)}`}
                css={{ display: "inline-flex", alignItems: "center" }}
            >
                {t("manage.my-videos.manage-video")}
                <FiChevronRight css={{ fontSize: 22 }} />
            </Link>
        )}

        <div css={{ height: 80 }} />

        {event.series && <SeriesBlockFromSeries
            realmPath={realmPath} fragRef={event.series}
            title={t("video.more-from-series", { series: event.series.title })}
            activeEventId={id}
        />}
    </>;
};

type MetaDatumProps = {
    label: string;
    value: string | null | undefined;
};

const MetaDatum: React.FC<MetaDatumProps> = ({ label, value }) => {
    if (value == null) {
        return null;
    }

    return <tr>
        <td>{label}:</td>
        <td>{value}</td>
    </tr>;
};
