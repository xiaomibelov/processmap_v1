import SidebarSection from "./SidebarSection";

export default function PropertySection({
  count,
  open,
  onToggle,
  children,
}) {
  return (
    <SidebarSection
      title="Свойства"
      count={count}
      open={open}
      onToggle={onToggle}
      infoLabel="О свойствах"
      infoText="Camunda extension properties текущего элемента. Быстрые свойства — приоритетные поля, остальные — полный список."
      className="sidebarPropertiesSection--properties"
      dataTestId="property-section"
    >
      {children}
    </SidebarSection>
  );
}
