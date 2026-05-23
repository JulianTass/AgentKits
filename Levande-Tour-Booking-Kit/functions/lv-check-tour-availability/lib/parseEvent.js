'use strict';

function parseJsonSafe(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function shallowObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function extractInput(event) {
  let e = event;
  if (typeof e === 'string') {
    try {
      e = JSON.parse(e);
    } catch {
      e = {};
    }
  }
  e = e && typeof e === 'object' ? e : {};

  const body = parseJsonSafe(e.body, {});
  const requestRaw = shallowObject(e.request);
  const requestArgs = shallowObject(requestRaw.arguments);
  const { arguments: _drop, ...request } = requestRaw;
  const args = shallowObject(e.arguments);
  const inputRaw = shallowObject(e.input);
  const inputArgs = shallowObject(inputRaw.arguments);
  const { arguments: _inDrop, ...input } = inputRaw;
  const params = shallowObject(e.params);
  const data = shallowObject(e.data);
  const payload = shallowObject(e.payload);
  const properties = shallowObject(e.properties);
  const parameters = shallowObject(e.parameters);

  return {
    ...body,
    ...request,
    ...requestArgs,
    ...args,
    ...input,
    ...inputArgs,
    ...params,
    ...data,
    ...payload,
    ...properties,
    ...parameters,
    ...e,
  };
}

function ok(payload) {
  return { success: true, ...payload };
}

function fail(message, code = 'ERROR', details) {
  const out = { success: false, error: message, code };
  if (details !== undefined) out.details = details;
  return out;
}

module.exports = { extractInput, ok, fail };
