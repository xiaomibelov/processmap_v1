import { useCallback, useEffect, useMemo, useState } from "react";
import {
  blankMembership,
  normalizeMemberships,
  normalizePermissions,
  rolePermissionTemplate,
  toText,
} from "../components/users/userAccessUtils.js";

export function useUserAccessForm({ user = null, orgOptions = [], fallbackOrgId = "" }) {
  const normalizedOrgOptions = useMemo(() => {
    const rows = Array.isArray(orgOptions) ? orgOptions : [];
    return rows
      .map((row) => ({
        org_id: toText(row?.org_id || row?.id),
        name: toText(row?.name || row?.org_name || row?.org_id || row?.id),
      }))
      .filter((row) => row.org_id);
  }, [orgOptions]);

  const effectiveFallbackOrgId = useMemo(
    () => toText(fallbackOrgId || normalizedOrgOptions[0]?.org_id),
    [fallbackOrgId, normalizedOrgOptions]
  );

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [memberships, setMemberships] = useState(() => normalizeMemberships([], effectiveFallbackOrgId));

  const reset = useCallback(
    (nextUser = null) => {
      const u = nextUser && typeof nextUser === "object" ? nextUser : null;
      setEmail(toText(u?.email));
      setFullName(toText(u?.full_name || u?.fullName));
      setJobTitle(toText(u?.job_title || u?.jobTitle));
      setPassword("");
      setIsActive(u ? Boolean(u?.is_active) : true);
      setIsPlatformAdmin(Boolean(u?.is_admin));
      setMemberships(normalizeMemberships(u?.memberships || [], effectiveFallbackOrgId));
    },
    [effectiveFallbackOrgId]
  );

  useEffect(() => {
    reset(user);
  }, [user, reset]);

  const validate = useCallback(() => {
    const nextEmail = toText(email).toLowerCase();
    if (!nextEmail) return "Укажите email.";
    if (!user && password.length < 8) return "Для нового пользователя нужен пароль не короче 8 символов.";
    if (!isPlatformAdmin) {
      const validMemberships = memberships.filter((m) => toText(m?.org_id));
      if (validMemberships.length === 0) return "Нужно назначить хотя бы одну организацию.";
    }
    return "";
  }, [email, isPlatformAdmin, memberships, password, user]);

  const buildPayload = useCallback(() => {
    const nextMemberships = isPlatformAdmin
      ? []
      : memberships
          .filter((m) => toText(m?.org_id))
          .map((m) => ({
            org_id: toText(m.org_id),
            role: toText(m.role) || "org_viewer",
            permissions: m?.permissions || rolePermissionTemplate(m.role),
          }));
    const payload = {
      email: toText(email).toLowerCase(),
      full_name: toText(fullName),
      job_title: toText(jobTitle),
      is_admin: isPlatformAdmin,
      is_active: isActive,
      memberships: nextMemberships,
    };
    if (password) payload.password = password;
    return payload;
  }, [email, fullName, isActive, isPlatformAdmin, jobTitle, memberships, password]);

  const handleMembershipChange = useCallback((index, field, value) => {
    setMemberships((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        const next = { ...row, [field]: value };
        if (field === "role") {
          next.permissions = { ...rolePermissionTemplate(value) };
        }
        return next;
      })
    );
  }, []);

  const handlePermissionChange = useCallback((index, key, value) => {
    setMemberships((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        if (key === "view") return row;
        return { ...row, permissions: { ...row.permissions, [key]: value } };
      })
    );
  }, []);

  const handleAddMembership = useCallback(() => {
    setMemberships((prev) => {
      const used = new Set(prev.map((m) => toText(m?.org_id)).filter(Boolean));
      const nextOrg =
        normalizedOrgOptions.find((o) => !used.has(o.org_id))?.org_id ||
        effectiveFallbackOrgId ||
        "";
      return [...prev, blankMembership(nextOrg)];
    });
  }, [effectiveFallbackOrgId, normalizedOrgOptions]);

  const handleRemoveMembership = useCallback((index) => {
    setMemberships((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  return {
    email,
    setEmail,
    fullName,
    setFullName,
    jobTitle,
    setJobTitle,
    password,
    setPassword,
    isActive,
    setIsActive,
    isPlatformAdmin,
    setIsPlatformAdmin,
    memberships,
    setMemberships,
    normalizedOrgOptions,
    reset,
    validate,
    buildPayload,
    handleMembershipChange,
    handlePermissionChange,
    handleAddMembership,
    handleRemoveMembership,
  };
}
