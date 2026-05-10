import { PopupPanel, usePopupClose } from "@renderer/components/PopupPanel";
import { GeneralSettingsTab } from "@renderer/pages/SettingsPage";
import { PopupUseArguments } from "@renderer/states/PopupStore";

export function SettingsPopup({ submit: rawSubmit }: PopupUseArguments<void>) {
    const animateClose = usePopupClose();
    const submit = () => animateClose(() => rawSubmit());

    return (
        <PopupPanel
            title="Settings"
            onClose={submit}
            size="xxl"
            bodyClassName="settings-popup-body scrollbar"
        >
            <GeneralSettingsTab />
        </PopupPanel>
    );
}
