import fs from 'fs';
import path from 'path';
const BASE = 'C:\\Projects\\Speaking';

// 1. Patch main.py
const mainPath = path.join(BASE, 'backend/app/main.py');
let main = fs.readFileSync(mainPath, 'utf8');
if (!main.includes('rubrics')) {
  main = main.replace(
    'from app.api.v1 import auth, users, videos, speaking, ai, payments, invite, vocabulary, youtube, browse, community',
    'from app.api.v1 import auth, users, videos, speaking, ai, payments, invite, vocabulary, youtube, browse, community, rubrics'
  );
  main = main.replace(
    'app.include_router(community.router, prefix',
    'app.include_router(rubrics.router, prefix= /api/v1)\n    app.include_router(community.router, prefix'
  );
  fs.writeFileSync(mainPath, main, 'utf8');
  console.log('OK: main.py patched');
} else { console.log('SKIP: main.py'); }

// 2. Update ai_service.py
const aiPath = path.join(BASE, 'backend/app/services/ai_service.py');
let ai = fs.readFileSync(aiPath, 'utf8');
if (!ai.includes('intonation')) {
  const oldPrompt = 'Return JSON: { accuracy: 0-100, fluency: 0-100, completeness: 0-100, feedback: string }';
  const newPrompt = 'Return JSON: { accuracy: 0-100, fluency: 0-100, completeness: 0-100, intonation: 0-100, grammar: 0-100, feedback: string }. accuracy = pronunciation, fluency = pace, completeness = words, intonation = rhythm, grammar = structure';
  ai = ai.replace(oldPrompt, newPrompt);
  ai = ai.replace(
    '{accuracy: 0, fluency: 0, completeness: 0, feedback: \u8bc4\u5206\u5931\u8d25}',
    '{accuracy: 0, fluency: 0, completeness: 0, intonation: 0, grammar: 0, feedback: \u8bc4\u5206\u5931\u8d25}'
  );
  fs.writeFileSync(aiPath, ai, 'utf8');
  console.log('OK: ai_service.py updated');
} else { console.log('SKIP: ai_service.py'); }

// 3. Update speaking schema
const schemaPath = path.join(BASE, 'backend/app/schemas/speaking.py');
fs.writeFileSync(schemaPath, rom pydantic import BaseModel


class SpeakingSubmitResponse(BaseModel):
    id: str
    accuracy: float
    fluency: float
    completeness: float
    intonation: float = 0
    grammar: float = 0
    feedback: str
    transcript: str


class SpeakingAttemptResponse(BaseModel):
    id: str
    subtitle_id: str
    accuracy: float | None
    fluency: float | None
    completeness: float | None
    feedback: str | None
    transcript: str | None
    created_at: str

    model_config = {from_attributes: True}
, 'utf8');
console.log('OK: speaking schema updated');

// 4. Update speaking API
const speakingPath = path.join(BASE, 'backend/app/api/v1/speaking.py');
let sp = fs.readFileSync(speakingPath, 'utf8');
if (!sp.includes('intonation')) {
  sp = sp.replace(
    'completeness=attempt.completeness or 0,\n        feedback=attempt.feedback',
    'completeness=attempt.completeness or 0,\n        intonation=0,\n        grammar=0,\n        feedback=attempt.feedback'
  );
  fs.writeFileSync(speakingPath, sp, 'utf8');
  console.log('OK: speaking API updated');
} else { console.log('SKIP: speaking API'); }

// 5. Update frontend types
const typesPath = path.join(BASE, 'frontend/src/types/index.ts');
let types = fs.readFileSync(typesPath, 'utf8');
if (!types.includes('RubricCriterion')) {
  types = types.replace(
    'export interface SpeakingAttempt {',
    'export interface RubricCriterion {\n  id: string;\n  name: string;\n  description: string;\n  weight: number;\n  sort_order: number;\n}\n\nexport interface SpeakingRubric {\n  id: string;\n  name: string;\n  description: string;\n  is_default: boolean;\n  criteria: RubricCriterion[];\n}\n\nexport interface SpeakingAttempt {'
  );
  fs.writeFileSync(typesPath, types, 'utf8');
  console.log('OK: frontend types updated');
} else { console.log('SKIP: frontend types'); }

console.log('All patches applied!');
