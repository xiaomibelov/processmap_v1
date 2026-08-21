import { memo } from "react";
import { CamundaPropertiesSettings } from "./ElementSettingsControls";
import { areCamundaPropertiesSectionPropsEqual } from "./camundaPropertiesSectionMemo";

function CamundaPropertiesSection(props) {
  return <CamundaPropertiesSettings {...props} />;
}

export default memo(CamundaPropertiesSection, areCamundaPropertiesSectionPropsEqual);
