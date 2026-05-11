import { combinerRegistry, shapeRegistry } from '@trama/projector-web';
import {
  createEmptyModel,
  documentToModel,
  extractAndParseTramaFromMarkdown,
  modelToDocument,
  parseTrama,
  serializeTrama,
  serializeTramaMarkdown,
  type Model,
} from '@trama/core';

const MODEL_PREFIX = 'trama:model:';
const INDEX_KEY = 'trama:models:index';

export interface ModelIndexEntry {
  id: string;
  question: string | null;
  updatedAt: number;
  createdAt: number;
}

export function loadIndex(): ModelIndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr as ModelIndexEntry[];
  } catch {
    return [];
  }
}

function saveIndex(entries: ModelIndexEntry[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

export function loadModel(id: string): Model | null {
  const raw = localStorage.getItem(MODEL_PREFIX + id);
  if (!raw) return null;
  try {
    const doc = parseTrama(raw, { shapeRegistry, combinerRegistry });
    return documentToModel(doc);
  } catch {
    return null;
  }
}

export function saveModel(model: Model): void {
  const doc = modelToDocument(model);
  const json = serializeTrama(doc);
  localStorage.setItem(MODEL_PREFIX + model.id, json);
  const index = loadIndex().filter((e) => e.id !== model.id);
  index.unshift({
    id: model.id,
    question: model.question,
    updatedAt: model.updatedAt,
    createdAt: model.createdAt,
  });
  index.sort((a, b) => b.updatedAt - a.updatedAt);
  saveIndex(index);
}

export function removeModel(id: string): void {
  localStorage.removeItem(MODEL_PREFIX + id);
  saveIndex(loadIndex().filter((e) => e.id !== id));
}

export function newModel(question: string | null = null): Model {
  const m = createEmptyModel();
  return { ...m, question };
}

/** 단일 모델 JSON 문자열을 가져옴. /m/<id> 라우트에서 TramaEditor에 넘기는 용도. */
export function loadModelJson(id: string): string | null {
  return localStorage.getItem(MODEL_PREFIX + id);
}

export function newEmptyModelJson(question: string | null = null): string {
  return serializeTrama(modelToDocument(newModel(question)));
}

/** 모델을 마크다운 형식(``` trama 펜스)으로 내보냄. */
export function exportMarkdown(model: Model): string {
  return serializeTramaMarkdown(modelToDocument(model));
}

/** 마크다운 문자열에서 trama 펜스를 추출해 모델로 import하고 새 ID를 부여한다. */
export function importMarkdown(md: string): Model | null {
  try {
    const doc = extractAndParseTramaFromMarkdown(md, { shapeRegistry, combinerRegistry });
    const m = documentToModel(doc);
    const now = Date.now();
    return { ...m, id: `mdl-${Math.random().toString(36).slice(2, 8)}`, createdAt: now, updatedAt: now };
  } catch {
    return null;
  }
}
