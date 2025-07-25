import {
    PropsWithChildren,
    ReactNode,
    forwardRef,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { LuCircleCheck, LuCalendar } from "react-icons/lu";
import { boxError, Button, ProtoButton, Spinner, useColorScheme } from "@opencast/appkit";

import { ellipsisOverflowCss, focusStyle } from ".";
import { COLORS } from "../color";
import { Creators } from "./Video";
import { Input, TextArea } from "./Input";
import { Form } from "./Form";
import { Inertable, OcEntity } from "../util";
import { RelativeDate } from "./time";


export const TitleLabel: React.FC<{ htmlFor: string }> = ({ htmlFor }) => {
    const { t } = useTranslation();
    return <label {...{ htmlFor }}>
        {t("general.title")}
        <FieldIsRequiredNote />
    </label>;
};

export const FieldIsRequiredNote: React.FC = () => {
    const { t } = useTranslation();

    return <span css={{ fontWeight: "normal" }}>
        {" ("}
        <em>{t("manage.metadata-form.required")}</em>
        {")"}
    </span>;
};

type InputContainerProps = PropsWithChildren & {
    className?: string;
};

/** Separates different inputs in the metadata form */
export const InputContainer: React.FC<InputContainerProps> = ({ children, className }) => (
    <div {...{ className }} css={{ margin: "16px 0 " }}>{children}</div>
);

export type DateAndCreatorsProps = {
    timestamp?: string;
    isLive: boolean;
    creators?: (string | JSX.Element)[];
    className?: string;
};

/** Shows a datetime and creators in one line, each with an icon in front. */
export const DateAndCreators: React.FC<DateAndCreatorsProps> = ({
    timestamp, isLive, creators, className,
}) => (
    <div {...{ className }} css={{
        display: "inline-flex",
        color: COLORS.neutral80,
        fontSize: 12,
        gap: 24,
        whiteSpace: "nowrap",
    }}>
        {timestamp && <div css={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LuCalendar css={{ fontSize: 15, color: COLORS.neutral60 }} />
            <RelativeDate date={new Date(timestamp)} isLive={isLive} />
        </div>}
        <Creators creators={creators ?? null} css={{
            minWidth: 0,
            fontSize: 12,
            svg: {
                fontSize: 15,
            },
            ul: {
                display: "inline-block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
            },
            li: {
                display: "inline",
            },
        }} />
    </div>
);

type SmallDescriptionProps = {
    text?: ReactNode | null;
    lines?: number;
    className?: string;
};

/**
 * An event's or series' description in at most `lines` lines. The text is not
 * transformed at all, but emitted as is.
 */
export const SmallDescription: React.FC<SmallDescriptionProps> = ({
    text,
    className,
    lines = 2,
}) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";
    const sharedStyle = {
        fontSize: 13,
        marginTop: 4,
        color: COLORS.neutral60,
    };

    if (text === null) {
        return <div {...{ className }} css={{
            ...sharedStyle,
            fontStyle: "italic",
            color: isDark ? COLORS.neutral60 : COLORS.neutral50,
        }}>{t("general.no-description")}</div>;
    } else {
        return <div {...{ className }} css={{
            ...sharedStyle,
            maxWidth: 800,
            color: isDark ? COLORS.neutral70 : COLORS.neutral60,
            ...ellipsisOverflowCss(lines),
        }}>{text}</div>;
    }
};


type DescriptionProps = {
    text?: string | null;
    className?: string;
};

/**
 * Display an event's or series' description. The text is transformed slightly
 * into proper paragraphs.
 */
export const Description = forwardRef<HTMLDivElement, DescriptionProps>(
    ({ text, className }, ref) => {
        const { t } = useTranslation();

        const stripped = text?.trim();
        if (!stripped) {
            return <div {...{ className }} css={{ fontStyle: "italic" }}>
                {t("general.no-description")}
            </div>;
        }

        // We split the whole description by empty lines (two or more consecutive
        // newlines). That's the typical "make paragraphs from text" algorithm also
        // used by Markdown. However, we capture those newlines to be able to
        // output any extra (in addition to two) newlines. If a user typed many
        // newlines in their description, they probably want to have more space
        // there. The newlines between and within the paragraphs are then displayed
        // via `white-space: pre-line` below.
        const paragraphs = stripped.split(/(\n{2,})/);

        // TODO: auto link URL-like things?
        return (
            <div ref ={ref} {...{ className }} css={{
                lineHeight: "1.43em",
                whiteSpace: "pre-line",
                "& > p:not(:first-child)": {
                    marginTop: 8,
                },
            }}>
                {paragraphs.map((s, i) => i % 2 === 0
                    ? <p key={i}>{s}</p>
                    : s.slice(2))}
            </div>
        );
    },
);

type CollapsibleDescriptionProps = {
    type: OcEntity;
    description?: string | null;
    creators?: readonly string[];
    bottomPadding: number;
}

export const CollapsibleDescription: React.FC<CollapsibleDescriptionProps> = (
    { type, description, creators, bottomPadding },
) => {
    const { t } = useTranslation();
    const isVideo = type === "video";

    const descriptionRef = useRef<HTMLDivElement>(null);
    const descriptionContainerRef = useRef<HTMLDivElement>(null);

    const [expanded, setExpanded] = useState(false);
    const [showButton, setShowButton] = useState(false);

    const resizeObserver = new ResizeObserver(() => {
        if (descriptionRef.current && descriptionContainerRef.current) {
            setShowButton(
                descriptionRef.current.scrollHeight > descriptionContainerRef.current.offsetHeight
                || expanded,
            );
        }
    });

    useEffect(() => {
        if (descriptionRef.current) {
            resizeObserver.observe(descriptionRef.current);
        }

        return () => resizeObserver.disconnect();
    });

    const InnerDescription: React.FC<({ truncated?: boolean })> = ({ truncated = false }) => <>
        {creators && <Creators creators={creators} css={{
            fontWeight: "bold",
            marginBottom: 12,
        }} />}
        <Description
            text={description}
            css={{
                color: COLORS.neutral80,
                fontSize: 14,
                maxWidth: isVideo ? "90ch" : "85ch",
                ...truncated && ellipsisOverflowCss(6),
            }}
        />
    </>;

    const sharedStyle = {
        padding: isVideo ? "20px 22px" : "8px 12px",
        ...showButton && {
            paddingBottom: expanded ? bottomPadding : 26,
        },
    };

    return (
        <div ref={descriptionContainerRef} css={{
            flex: description ? "1 400px" : "1 200px",
            alignSelf: "flex-start",
            position: "relative",
            overflow: "hidden",
        }}>
            <div ref={descriptionRef} css={{
                position: expanded ? "initial" : "absolute",
                top: 0,
                left: 0,
                ...sharedStyle,
            }}><InnerDescription /></div>
            <div css={{
                visibility: "hidden",
                ...sharedStyle,
                ...expanded && { display: "none" },
            }}><InnerDescription truncated /></div>
            <div css={{
                ...!showButton && { display: "none" },
                ...!expanded && {
                    background: `linear-gradient(transparent, ${COLORS.neutral10} 60%)`,
                    paddingTop: 30,
                },
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
            }}>
                <ProtoButton onClick={() => setExpanded(b => !b)} css={{
                    textAlign: "center",
                    fontSize: 12,
                    ...isVideo ? {
                        borderRadius: "0 0 8px 8px",
                        padding: "4px 0",
                        width: "100%",
                    } : {
                        borderRadius: 8,
                        padding: "4px 8px",
                        marginLeft: 4,
                    },
                    ":hover, :focus-visible": { backgroundColor: COLORS.neutral15 },
                    ...focusStyle({ inset: true }),
                }}>
                    <b>
                        {expanded
                            ? t("video.description.show-less")
                            : t("video.description.show-more")
                        }
                    </b>
                </ProtoButton>
            </div>
        </div>
    );
};


type MetadataFormProps = PropsWithChildren & React.HTMLAttributes<HTMLFormElement> & {
    hasError?: boolean;
};

export const MetadataForm: React.FC<MetadataFormProps> = ({
    hasError = false,
    children,
    ...props
}) => <Inertable isInert={hasError}>
    <Form
        noValidate
        // We only allow submitting the form on clicking a button, so that
        // pressing 'enter' inside inputs won't submit the form too early.
        onSubmit={e => e.preventDefault()}
        css={{
            margin: "32px 2px",
            label: { color: "var(--color-neutral90)" },
        }}
        {...props}
    >
        {children}
    </Form>
</Inertable>;

type MetadataFieldsProps = {
    disabled?: boolean;
}

export const MetadataFields: React.FC<MetadataFieldsProps> = ({ disabled = false }) => {
    const { t } = useTranslation();
    const titleFieldId = useId();
    const descriptionFieldId = useId();
    const { register, formState: { errors } } = useFormContext();


    return <div style={{ maxWidth: 750 }}>
        {/* Title */}
        <InputContainer>
            <TitleLabel htmlFor={titleFieldId} />
            <Input
                id={titleFieldId}
                required
                disabled={disabled}
                error={!!errors.title}
                css={{ width: 400, maxWidth: "100%" }}
                {...register("title", {
                    required: t("manage.metadata-form.errors.field-required") as string,
                })}
            />
            {boxError(errors.title?.message as string)}
        </InputContainer>

        {/* Description */}
        <InputContainer>
            <label htmlFor={descriptionFieldId}>
                {t("manage.metadata-form.description")}
            </label>
            <TextArea
                id={descriptionFieldId}
                disabled={disabled}
                {...register("description")} />
        </InputContainer>
    </div>;
};

type SubmitButtonWithStatusProps = {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    inFlight?: boolean;
    success: boolean;
    setSuccess: React.Dispatch<React.SetStateAction<boolean>>;
    timeout?: number;
};

export const SubmitButtonWithStatus: React.FC<SubmitButtonWithStatusProps> = ({
    label,
    onClick,
    disabled,
    inFlight,
    success,
    setSuccess,
    timeout = 1000,
}) => {
    useEffect(() => {
        if (!success) {
            return;
        }
        const timer = setTimeout(() => setSuccess(false), timeout);
        return () => clearTimeout(timer);
    }, [success]);

    return <div css={{ display: "flex", marginTop: 32 }}>
        <Button kind="call-to-action" disabled={disabled} onClick={onClick}>
            {label}
        </Button>
        <span css={{
            display: "flex",
            alignSelf: "center",
            marginLeft: 12,
            position: "relative",
            width: 20,
            height: 20,
        }}>
            <Spinner size={20} css={{
                position: "absolute",
                transition: "opacity ease-out 250ms",
                opacity: inFlight ? 1 : 0,
            }} />
            <LuCircleCheck size={20} css={{
                position: "absolute",
                transition: "opacity ease-in 300ms",
                opacity: success ? 1 : 0,
            }} />
        </span>
    </div>;
};
