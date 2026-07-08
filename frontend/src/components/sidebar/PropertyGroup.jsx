import React from "react";

export default function PropertyGroup({ title, children, className = "" }) {
  if (!React.Children.toArray(children).some(Boolean)) return null;
  return (
    <section className={`property-group ${className}`}>
      <div className="property-group-head">
        <h3 className="property-group-title">{title}</h3>
      </div>
      <div className="property-group-content">
        {children}
      </div>
    </section>
  );
}
