import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LatexCapability, ManuscriptRenderPayload } from '@aeroscribe/contract';
import { CapabilityUnavailableError } from '../errors';
import { hashBytes } from '../store/registry';
import { sha256 } from '../lib/canonical';
import { compileLatex, type CompileResult } from './compile';
import { renderManuscript, type RenderInput, type RenderedManuscript } from './render';

export * from './escape';
export * from './bibliography';
export * from './figures';
export * from './render';
export * from './toolchain';
export * from './compile';

/**
 * Rendering and typesetting, in one place.
 *
 * The pattern is the CFD one, deliberately: the **source is always produced**,
 * the PDF only when a toolchain answered the probe, and the absence of a PDF is
 * a blocker with a reason — never a quietly smaller claim. A run whose journal
 * requires a PDF is blocked, and the record says why.
 */

export interface LatexServiceOptions {
  latex: LatexCapability;
  /**
   * Directory that holds one subdirectory per run. Defaults to a fresh temp
   * directory, which is what a unit test wants and what a misconfigured server
   * would silently get — so `buildServer` always passes the data directory.
   */
  workDir?: string;
  /** Wall-clock limit per engine pass. */
  timeoutMs?: number;
  /** Passes per compile; 2 resolves a bibliography, 1 is enough for a test. */
  passes?: number;
}

export interface RenderOutcome {
  payload: ManuscriptRenderPayload;
  rendered: RenderedManuscript;
  /** Absolute path of the PDF, or `null` when nothing was typeset. */
  pdfPath: string | null;
  /** Present exactly when `typeset` is `source-only`. */
  blocker: string | null;
  /** Directory the files were written to. */
  directory: string;
  compile: CompileResult | null;
}

export type ArtefactKind = 'tex' | 'pdf';

export interface TextArtefact {
  kind: 'tex';
  name: string;
  content: string;
  sha256: string;
}

export interface BinaryArtefact {
  kind: 'pdf';
  name: string;
  bytes: Buffer;
  sha256: string;
}

/** A run id is ours, but it reaches a filesystem path — sanitise it once. */
export function runDirectoryName(runId: string): string {
  return runId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** The exact sentence stage 8 records when no PDF was produced. */
export function typesetBlocker(capability: LatexCapability): string {
  if (!capability.configured) {
    return 'the manuscript PDF was not typeset (LATEX_BINARY is not set)';
  }
  return `the manuscript PDF was not typeset (LATEX_BINARY points at "${capability.binary ?? ''}", which did not answer --version)`;
}

export class LatexService {
  private readonly options: LatexServiceOptions;
  private readonly workDir: string;

  constructor(options: LatexServiceOptions) {
    this.options = options;
    this.workDir = options.workDir ?? mkdtempSync(join(tmpdir(), 'aeroscribe-manuscript-'));
  }

  get capability(): LatexCapability {
    return this.options.latex;
  }

  directoryFor(runId: string): string {
    return join(this.workDir, runDirectoryName(runId));
  }

  /**
   * Render, write, and (when possible) compile one manuscript.
   *
   * A compile *failure* is thrown, not swallowed: a `.tex` this service wrote
   * that the engine refuses is a bug, and downgrading it to `source-only` would
   * present a broken document as a legitimate one.
   */
  async build(input: RenderInput): Promise<RenderOutcome> {
    const rendered = renderManuscript(input);
    const directory = this.directoryFor(input.runId);
    await mkdir(directory, { recursive: true });

    for (const file of rendered.files) {
      await writeFile(join(directory, file.name), file.content, 'utf8');
    }

    const { available, binary, version } = this.options.latex;
    let compile: CompileResult | null = null;
    if (available && binary) {
      compile = await compileLatex({
        binary,
        workDir: directory,
        ...(this.options.timeoutMs === undefined ? {} : { timeoutMs: this.options.timeoutMs }),
        ...(this.options.passes === undefined ? {} : { passes: this.options.passes }),
      });
    }

    const payload: ManuscriptRenderPayload = {
      stage: 'manuscript-render',
      schemaVersion: 1,
      runId: input.runId,
      journal: input.journal.name,
      template: rendered.template,
      generatedAt: input.manuscript.generatedAt,
      files: rendered.files.map((file) => ({
        name: file.name,
        sha256: sha256(file.content),
        bytes: Buffer.byteLength(file.content, 'utf8'),
      })),
      texSha256: rendered.texSha256,
      pdf: compile ? { sha256: compile.sha256, bytes: compile.bytes } : null,
      typeset: compile ? 'pdf' : 'source-only',
      toolchain: compile ? { binary: binary as string, version } : null,
      missingBibliographyFields: rendered.missingBibliographyFields,
    };

    return {
      payload,
      rendered,
      pdfPath: compile?.pdfPath ?? null,
      blocker: compile ? null : typesetBlocker(this.options.latex),
      directory,
      compile,
    };
  }

  /**
   * The artefact that is actually on disk, for a download route.
   *
   * Reads the file rather than re-rendering, so what a reviewer downloads is
   * what the record hashed. The caller compares the hash with the record.
   */
  async read(runId: string, kind: ArtefactKind): Promise<TextArtefact | BinaryArtefact> {
    const directory = this.directoryFor(runId);
    if (kind === 'tex') {
      const path = join(directory, 'manuscript.tex');
      const content = await readFile(path, 'utf8');
      return { kind: 'tex', name: 'manuscript.tex', content, sha256: sha256(content) };
    }

    let bytes: Buffer;
    try {
      bytes = await readFile(join(directory, 'manuscript.pdf'));
    } catch {
      throw new CapabilityUnavailableError(
        'LaTeX',
        'this run has no typeset PDF; its record says typeset="source-only"',
        { runId, binary: this.options.latex.binary },
      );
    }
    return { kind: 'pdf', name: 'manuscript.pdf', bytes, sha256: hashBytes(bytes) };
  }
}
