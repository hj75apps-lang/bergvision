import { useCallback, useEffect, useState } from "react";

/**
 * Pastas de templates do Studio. A tabela `templates` não tem coluna de pasta
 * e o schema não pode ser alterado, então a organização fica salva neste
 * navegador (por organização).
 */
export type TemplateFolderState = {
  folders: string[];
  assign: Record<string, string>; // templateId -> nome da pasta
};

const EMPTY: TemplateFolderState = { folders: [], assign: {} };
export const FOLDER_NAME_MAX = 60;

export function normalizeFolderName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, FOLDER_NAME_MAX);
}

function parse(raw: string | null): TemplateFolderState {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object") return EMPTY;
    const o = v as Partial<TemplateFolderState>;
    const folders = Array.isArray(o.folders)
      ? o.folders.filter((x): x is string => typeof x === "string")
      : [];
    const assign: Record<string, string> = {};
    if (o.assign && typeof o.assign === "object") {
      for (const [k, val] of Object.entries(o.assign)) {
        if (typeof val === "string" && folders.includes(val)) assign[k] = val;
      }
    }
    return { folders, assign };
  } catch {
    return EMPTY;
  }
}

export function useTemplateFolders(orgId: string | null) {
  const key = orgId ? `bv:studio-template-folders:${orgId}` : null;
  const [state, setState] = useState<TemplateFolderState>(EMPTY);

  useEffect(() => {
    setState(key ? parse(window.localStorage.getItem(key)) : EMPTY);
  }, [key]);

  const save = useCallback(
    (next: TemplateFolderState) => {
      setState(next);
      if (key) window.localStorage.setItem(key, JSON.stringify(next));
    },
    [key],
  );

  const createFolder = (raw: string): string | null => {
    const name = normalizeFolderName(raw);
    if (!name || state.folders.includes(name)) return null;
    save({ ...state, folders: [...state.folders, name].sort((a, b) => a.localeCompare(b, "pt-BR")) });
    return name;
  };

  const renameFolder = (from: string, raw: string): boolean => {
    const to = normalizeFolderName(raw);
    if (!to || (to !== from && state.folders.includes(to))) return false;
    const assign: Record<string, string> = {};
    for (const [k, v] of Object.entries(state.assign)) assign[k] = v === from ? to : v;
    save({
      folders: state.folders.map((f) => (f === from ? to : f)).sort((a, b) => a.localeCompare(b, "pt-BR")),
      assign,
    });
    return true;
  };

  const deleteFolder = (name: string) => {
    const assign: Record<string, string> = {};
    for (const [k, v] of Object.entries(state.assign)) if (v !== name) assign[k] = v;
    save({ folders: state.folders.filter((f) => f !== name), assign });
  };

  const moveTemplate = (templateId: string, folder: string | null) => {
    const assign = { ...state.assign };
    if (folder && state.folders.includes(folder)) assign[templateId] = folder;
    else delete assign[templateId];
    save({ ...state, assign });
  };

  return { ...state, createFolder, renameFolder, deleteFolder, moveTemplate };
}
