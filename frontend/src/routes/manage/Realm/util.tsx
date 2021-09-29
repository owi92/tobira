import { TFunction } from "i18next";
import { RegisterOptions } from "react-hook-form";

import { Card } from "../../../ui/Card";


type RealmValidations = {
    name: RegisterOptions;
    path: RegisterOptions;
};
export const realmValidations = (t: TFunction): RealmValidations => ({
    name: {
        required: t<string>("manage.realm.name-must-not-be-empty"),
    },
    path: {
        required: t<string>("manage.realm.path-must-not-be-empty"),
        minLength: {
            value: 2,
            message: t("manage.realm.path-too-short"),
        },
        pattern: {
            // Lowercase letter, decimal number or dash.
            value: /^(\p{Ll}|\p{Nd}|-)*$/u,
            message: t("manage.realm.path-must-be-alphanum-dash"),
        },
        // TODO: check if path already exists
    },
});

export const ErrorBox: React.FC = ({ children }) => (
    children == null
        ? null
        : <div css={{ marginTop: 8 }}>
            <Card kind="error">{children}</Card>
        </div>
);