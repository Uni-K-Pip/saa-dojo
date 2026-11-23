// @vitest-environment node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CourseSchema, checkCourse, courseItemKey, unitPracticePool } from '../../../scripts/lib/course.mjs';
import { checkContent, loadContent } from '../../../scripts/validate.mjs';
import { checkCourseForBuild } from '../lib/course-build.mjs';

const lesson = { kind: 'lesson', ref: 'lesson-1.1-iam-basics' };
const doc = { kind: 'doc', ref: 'cheatsheet-databases' };
const practice = { kind: 'practice' };
const unit = (id = 'u00', items = [lesson, doc, practice]) => ({ id, title: 'アクセス管理', items });
const stage = (id = 0, units = [unit()]) => ({ id, title: '土台', goal: '基礎を学ぶ', units });
const ctx = {
  lessons: [{ id: lesson.ref, knowledgeRefs: ['1.1-K1'] }],
  docIds: new Set([doc.ref]),
  questions: [{ id: 'q1', pool: 'practice', knowledgeRefs: ['1.1-K1'] }],
};
const errorsOf = (stages, context = ctx) => checkCourse({ stages }, context).errors.join('\n');

describe('学習コースのスキーマと検査', () => {
  it('各階層の未知のキー、不正な kind、不正なユニット id を拒む', () => {
    expect(CourseSchema.safeParse({ stages: [stage()] }).success).toBe(true);
    for (const data of [
      { stages: [stage()], extra: true },
      { stages: [{ ...stage(), extra: true }] },
      { stages: [stage(0, [{ ...unit(), extra: true }])] },
      { stages: [stage(0, [unit('u00', [{ ...practice, ref: lesson.ref }])])] },
      { stages: [stage(0, [unit('u00', [{ kind: 'lab' }])])] },
      { stages: [stage(0, [unit('u1')])] },
    ]) {
      expect(CourseSchema.safeParse(data).success, JSON.stringify(data)).toBe(false);
    }
  });

  it('存在しない参照とコースに入らないレッスンを報告する', () => {
    const errors = errorsOf([stage(0, [unit('u00', [
      { kind: 'lesson', ref: 'lesson-1.1-missing' }, { kind: 'doc', ref: 'guide-missing' },
    ])])]);
    expect(errors).toContain('lesson-1.1-missing が見つかりません');
    expect(errors).toContain('guide-missing が見つかりません');
    expect(errors).toContain(`${lesson.ref} がどのユニットにも入っていません`);
  });

  it('同じユニット内の項目と別ユニットのレッスンの重複を報告する', () => {
    const errors = errorsOf([stage(0, [unit('u00', [lesson, { ...lesson, note: '復習' }, doc]), unit('u01', [lesson, doc])])]);
    expect(errors).toContain(`${courseItemKey(lesson)} が重複しています`);
    expect(errors).toContain(`${lesson.ref} が複数のユニット（u00、u01）`);
    expect(errors).not.toContain(doc.ref);
    expect(errorsOf([stage(0, [unit('u00', [lesson, doc]), unit('u01', [doc])])])).toBe('');
  });

  it('ステージの欠け・逆順・重複を報告する', () => {
    for (const ids of [[1], [0, 2], [1, 0], [0, 0]]) {
      expect(errorsOf(ids.map((id, i) => stage(id, [i === 0 ? unit() : unit('u01', [doc])])))).toContain('ステージの id');
    }
  });

  it('ステージをまたぐユニット id の逆順と重複を報告する', () => {
    expect(errorsOf([stage(0, [unit('u02')]), stage(1, [unit('u01', [doc])])])).toContain('ユニットの id を昇順');
    expect(errorsOf([stage(), stage(1, [unit('u00', [doc])])])).toContain('ユニットの id u00 が重複');
  });

  it('レッスンがない演習と候補がない演習を報告する', () => {
    expect(errorsOf([stage(0, [unit('u00', [practice])])])).toContain('ユニット演習がありますが、レッスンがありません');
    expect(errorsOf([stage()], { ...ctx, questions: [] })).toContain('候補が 0 問');
  });

  it('ビルドの検査は、要修正・却下の問題を除いてユニット演習の候補を数える', () => {
    const course = { rel: 'course.json', data: { stages: [stage(0, [unit('u00', [lesson, practice])])] } };
    const parsed = (status) => ({
      course,
      lessons: [{ data: ctx.lessons[0] }],
      docs: [],
      questions: [{ data: ctx.questions[0] }],
      reviewStatus: { q1: { status, checkedAt: '2026-11-23' } },
    });
    const hidden = new Set(['needs-fix', 'rejected']);
    expect(checkCourseForBuild(parsed('verified'), hidden).errors).toEqual([]);
    expect(checkCourseForBuild(parsed('needs-fix'), hidden).errors).toContain('u00 のユニット演習の候補が 0 問です');
  });

  it('ミニラボがある場合も、既定ではミニラボのないユニットを警告しない', () => {
    const course = { stages: [stage(), ...[1, 2, 3].map((id) => stage(id, [unit(`u0${id}`, [doc])]))] };
    expect(checkCourse(course, ctx).warnings).toEqual([]);
    expect(checkCourse(course, { ...ctx, labIds: new Set() }).warnings).toEqual([]);
    expect(checkCourse(course, { ...ctx, labIds: new Set(['lab-test']) }).warnings).toEqual([]);
  });

  it('設定を有効にするとステージ 1・2 のミニラボがないユニットだけ警告する', () => {
    const lab = { kind: 'lab', ref: 'lab-test' };
    const course = { stages: [stage(), stage(1, [unit('u01', [doc]), unit('u02', [lab])]), stage(2, [unit('u03', [doc])]), stage(3, [unit('u04', [doc])])] };
    const context = { ...ctx, labIds: new Set([lab.ref]) };
    expect(checkCourse(course, { ...context, warnUnitsWithoutLab: false }).warnings).toEqual([]);
    expect(checkCourse(course, { ...context, warnUnitsWithoutLab: true }).warnings).toEqual([
      { code: 'course-no-lab', message: 'u01 にミニラボがありません' },
      { code: 'course-no-lab', message: 'u03 にミニラボがありません' },
    ]);
  });

  it('複数レッスンの知識項目に重なる問題から演習・基礎だけを id 順で返す', () => {
    const second = { kind: 'lesson', ref: 'lesson-basics-cloud-and-aws' };
    const questions = [
      { id: 'q5', pool: 'practice', knowledgeRefs: ['1.1-K1', 'basics-K1'] },
      { id: 'q2', pool: 'basics', knowledgeRefs: ['basics-K1'] },
      { id: 'q1', pool: 'practice', knowledgeRefs: ['1.1-K2'] },
      { id: 'q3', pool: 'mockA', knowledgeRefs: ['1.1-K1'] },
      { id: 'q4', pool: 'mockB', knowledgeRefs: ['1.1-K1'] },
    ];
    const lessons = [...ctx.lessons, { id: second.ref, knowledgeRefs: ['basics-K1'] }];
    expect(unitPracticePool(unit('u00', [lesson, second, practice]), { lessons, questions })).toEqual(['q2', 'q5']);
  });

  it('実データでは全 47 レッスンが 1 回ずつ入り、ユニット演習に保留模試が入らない', () => {
    const root = fileURLToPath(new URL('../../..', import.meta.url));
    const raw = JSON.parse(fs.readFileSync(new URL('../../../content/saa-c03/course.json', import.meta.url), 'utf8'));
    const course = CourseSchema.parse(raw);
    const content = checkContent(loadContent({ root }));
    expect(content.course).toEqual({ rel: 'course.json', data: course });
    expect(content.issues.filter((i) => i.level === 'error' && i.file.endsWith('/course.json'))).toEqual([]);

    const lessons = content.lessons.map(({ data }) => data);
    const questions = content.questions.map(({ data }) => data);
    const docIds = new Set(content.docs.map(({ data }) => data.id));
    expect(checkCourse(course, { lessons, questions, docIds })).toEqual({ errors: [], warnings: [] });
    const units = course.stages.flatMap(({ units }) => units);
    const refs = units.flatMap(({ items }) => items.filter(({ kind }) => kind === 'lesson').map(({ ref }) => ref));
    expect(refs).toHaveLength(47);
    expect(refs.sort()).toEqual(lessons.map(({ id }) => id).sort());
    const heldOut = new Set(questions.filter(({ pool }) => pool === 'mockA' || pool === 'mockB').map(({ id }) => id));
    for (const u of units.filter(({ items }) => items.some(({ kind }) => kind === 'practice'))) {
      const ids = unitPracticePool(u, { lessons, questions });
      expect(ids.length, u.id).toBeGreaterThan(0);
      expect(ids.filter((id) => heldOut.has(id)), u.id).toEqual([]);
    }
  });
});
