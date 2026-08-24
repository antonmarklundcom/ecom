import { describe, expect, it } from 'vitest';

import { checkDocker, checkGitRemote, checkNode, checkPnpm } from '../../scripts/doctor';

/**
 * `pnpm doctor` (NEW-STORE.md §1) — sólo las funciones puras de clasificación.
 * El comando real toca `docker`, `git` y el sistema de archivos; eso no se
 * testea acá, se lee a ojo corriéndolo.
 */

describe('checkNode', () => {
  it('bloquea por debajo del mínimo', () => {
    expect(checkNode('v18.19.0', '22').severity).toBe('bloquea');
  });

  it('bloquea por encima del máximo', () => {
    expect(checkNode('v25.0.0', '22').severity).toBe('bloquea');
  });

  it('ok dentro del rango aunque no coincida con .nvmrc', () => {
    expect(checkNode('v20.11.0', '22').severity).toBe('ok');
  });
});

describe('checkPnpm', () => {
  it('bloquea si no está instalado', () => {
    expect(checkPnpm(null, 'pnpm@11.22.0').severity).toBe('bloquea');
  });

  it('advierte si el major no coincide con packageManager', () => {
    expect(checkPnpm('9.1.0', 'pnpm@11.22.0').severity).toBe('advierte');
  });

  it('ok si coincide', () => {
    expect(checkPnpm('11.22.0', 'pnpm@11.22.0').severity).toBe('ok');
  });
});

describe('checkDocker', () => {
  it('bloquea si el binario no existe', () => {
    expect(checkDocker(false, false).severity).toBe('bloquea');
  });

  it('bloquea si está instalado pero el daemon no responde', () => {
    expect(checkDocker(false, true).severity).toBe('bloquea');
  });

  it('ok si el daemon responde', () => {
    expect(checkDocker(true, true).severity).toBe('ok');
  });
});

describe('checkGitRemote', () => {
  it('advierte si falta "template" (se puede agregar después)', () => {
    expect(checkGitRemote('template', null, null).severity).toBe('advierte');
  });

  it('bloquea si falta "origin"', () => {
    expect(checkGitRemote('origin', null, null).severity).toBe('bloquea');
  });

  it('bloquea si el remoto existe pero no responde', () => {
    const resultado = checkGitRemote('template', 'git@github.com:x/y.git', false);
    expect(resultado.severity).toBe('bloquea');
    expect(resultado.detail).toMatch(/SSH key/);
  });

  it('ok si responde', () => {
    expect(checkGitRemote('origin', 'https://github.com/x/y.git', true).severity).toBe('ok');
  });
});
