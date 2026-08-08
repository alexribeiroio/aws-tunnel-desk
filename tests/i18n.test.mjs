import assert from "node:assert/strict";
import test from "node:test";
import { translateText } from "../src/i18n.js";

test("keeps English source text unchanged", () => {
  assert.equal(translateText("en", "Open tunnel"), "Open tunnel");
});

test("translates exact source phrases", () => {
  assert.equal(translateText("pt", "Open tunnel"), "Abrir túnel");
  assert.equal(translateText("es", "Open tunnel"), "Abrir túnel");
  assert.equal(translateText("pt", "Approved destinations"), "Destinos aprovados");
  assert.equal(translateText("es", "Approved destinations"), "Destinos aprobados");
});

test("translates dynamic source phrases", () => {
  assert.equal(translateText("pt", "3 profile(s) found in AWS CLI."), "3 perfil(is) encontrado(s) no AWS CLI.");
  assert.equal(translateText("es", "3 profile(s) found in AWS CLI."), "3 perfil(es) encontrado(s) en AWS CLI.");
  assert.equal(translateText("pt", "Tunnel opened at localhost:15432."), "Túnel aberto em localhost:15432.");
});

test("preserves surrounding whitespace", () => {
  assert.equal(translateText("pt", "  Settings  "), "  Configurações  ");
});
