import SidebarSection from "./SidebarSection";

export default function OperationSection({
  count,
  open,
  onToggle,
  children,
}) {
  return (
    <SidebarSection
      title="Идентификация и Операция"
      count={count}
      open={open}
      onToggle={onToggle}
      infoLabel="Об идентификации и операции"
      infoText="Выбор операции из справочника и заполнение её параметров. To-Be показывает свойства, которые можно перенести из пула."
      className="sidebarPropertiesSection--operation"
      dataTestId="operation-section"
    >
      {children}
    </SidebarSection>
  );
}
