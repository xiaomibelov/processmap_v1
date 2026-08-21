export default function Select({ className = "", children, ...rest }) {
  /* IMPORTANT:
     Do NOT inherit ".input" styles here.
     In this repo ".input" may use transparent text tricks -> breaks <select>.
   */
  return (
    <select className={`uiSelect ${className}`.trim()} {...rest}>
      {children}
    </select>
  );
}
