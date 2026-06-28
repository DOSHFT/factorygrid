import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, test } from 'vitest'
import { createRunId, createSpecKitIntake, getFactoryWorkflowGuide, searchBrain, writeBrainPage } from './factory-brain'

describe('factory brain and spec-kit intake', () => {
  test('creates stable readable run ids', () => {
    const id = createRunId('Build the Operator Console', new Date('2026-05-18T10:11:12.000Z'))
    expect(id).toMatch(/^20260518-build-the-operator-console-[a-f0-9]{8}$/)
  })

  test('writes compiled truth and timeline brain pages', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-brain-'))
    const page = writeBrainPage({
      type: 'decision',
      title: 'Use brain-first lookup',
      compiledTruth: 'Agents must query the factory brain before planning.',
      timeline: [{ at: '2026-05-18T10:00:00.000Z', event: 'Decision accepted', evidence: 'Architecture.md' }],
      entities: ['FactoryGrid'],
      tags: ['brain-first'],
    }, root, new Date('2026-05-18T10:00:00.000Z'))

    const text = fs.readFileSync(path.join(root, page.path), 'utf-8')
    expect(text).toContain('## Compiled Truth')
    expect(text).toContain('Agents must query the factory brain before planning.')
    expect(text).toContain('Decision accepted [evidence: Architecture.md]')
  })

  test('creates spec-kit intake, draft spec, approval checklist, and brain page', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-intake-'))
    const result = createSpecKitIntake({
      title: 'Blue Team Cell',
      vision: 'Create a defensive research agent for cellular network security.',
      successCriteria: 'Agent can produce sourced research briefs and task plans.',
      cautions: 'No offensive automation.',
      requestedMode: 'PLAN',
    }, root, new Date('2026-05-18T12:00:00.000Z'))

    expect(fs.existsSync(path.join(root, result.requestPath))).toBe(true)
    expect(fs.existsSync(path.join(root, result.specPath))).toBe(true)
    expect(fs.existsSync(path.join(root, result.checklistPath))).toBe(true)
    expect(fs.existsSync(path.join(root, result.brainPath))).toBe(true)
    expect(fs.readFileSync(path.join(root, result.specPath), 'utf-8')).toContain('Status: DRAFT')
  })

  test('persists up to three research-start URLs in intake and spec artifacts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-intake-urls-'))
    const result = createSpecKitIntake({
      title: 'Context Workbench',
      vision: 'Add a better intake flow.',
      researchStartUrls: [
        ' https://github.github.com/spec-kit/ ',
        'https://linear.app/',
        'https://www.g2.com/categories/requirements-management',
        'https://example.com/ignored',
      ],
    }, root, new Date('2026-05-18T12:00:00.000Z'))

    const request = fs.readFileSync(path.join(root, result.requestPath), 'utf-8')
    const spec = fs.readFileSync(path.join(root, result.specPath), 'utf-8')

    expect(request).toContain('## Research Start URLs')
    expect(request).toContain('- https://github.github.com/spec-kit/')
    expect(request).toContain('- https://linear.app/')
    expect(request).toContain('- https://www.g2.com/categories/requirements-management')
    expect(request).not.toContain('ignored')
    expect(spec).toContain('- Start research from the operator-supplied URLs in')
  })

  test('searches brain pages by compiled content', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-search-'))
    writeBrainPage({
      type: 'component',
      title: 'Spec Kit adapter',
      compiledTruth: 'Spec Kit owns spec, plan, tasks, checklist artifacts.',
    }, root, new Date('2026-05-18T10:00:00.000Z'))

    const results = searchBrain('checklist artifacts', root)
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Spec Kit adapter')
  })

  test('workflow guide exposes the operator intake URL and phase owners', () => {
    const guide = getFactoryWorkflowGuide()
    expect(guide.intakeUrl).toBe('http://localhost:28588/factory')
    expect(guide.phases.map((phase) => phase.phase)).toContain('Memory')
    expect(guide.promptTemplate).toContain('Success criteria:')
  })
})
