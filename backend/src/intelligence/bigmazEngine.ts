import { createHash } from 'node:crypto'

export type BigmazIntent =
  | 'greeting'
  | 'property_search'
  | 'roommate_search'
  | 'product_search'
  | 'service_search'
  | 'neighbourhood_question'
  | 'escrow_explanation'
  | 'navigation'
  | 'support'
  | 'general'

export type IntentExample = {
  phrase: string
  intent: BigmazIntent
}

export type IntentWeight = { feature_hash: string; intent_key: BigmazIntent; weight: number }

export type IntentPrediction = {
  intent: BigmazIntent
  confidence: number
  alternatives: Array<{ intent: BigmazIntent; score: number }>
  modelVersion: string
}

const MODEL_VERSION = 'BIE-INTENT-1.0.0'

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'can', 'do', 'for', 'from',
  'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'please',
  'the', 'there', 'to', 'want', 'what', 'where', 'with', 'would', 'you',
  'your', 'looking', 'need', 'find', 'show', 'help', 'some', 'about',
])

const BASE_EXAMPLES: IntentExample[] = [
  { phrase: 'hello hi good morning good afternoon good evening', intent: 'greeting' },
  { phrase: 'find an apartment house flat room home accommodation to rent', intent: 'property_search' },
  { phrase: 'student accommodation hostel self contained bedsitter place to stay', intent: 'property_search' },
  { phrase: 'I need a house property land or shop for sale', intent: 'property_search' },
  { phrase: 'find a roommate flatmate housemate someone to share accommodation', intent: 'roommate_search' },
  { phrase: 'I need someone to share rent with me', intent: 'roommate_search' },
  { phrase: 'find a product phone laptop furniture electronics to buy', intent: 'product_search' },
  { phrase: 'I want to buy a computer television generator', intent: 'product_search' },
  { phrase: 'find a plumber electrician mechanic cleaner carpenter technician', intent: 'service_search' },
  { phrase: 'I need a professional to repair my equipment', intent: 'service_search' },
  { phrase: 'is this neighbourhood peaceful safe flooded noisy', intent: 'neighbourhood_question' },
  { phrase: 'tell me about the area electricity water roads security', intent: 'neighbourhood_question' },
  { phrase: 'what is escrow how does escrow work explain payment protection', intent: 'escrow_explanation' },
  { phrase: 'how is my money protected buyer seller payment held', intent: 'escrow_explanation' },
  { phrase: 'where do I find my dashboard messages profile settings', intent: 'navigation' },
  { phrase: 'how do I open neighbourhood space create a listing save favourite', intent: 'navigation' },
  { phrase: 'speak to administrator contact support report a problem complaint', intent: 'support' },
  { phrase: 'I want a human agent customer care representative', intent: 'support' },
]

function normalise(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9₦\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string): string[] {
  return normalise(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

function makeNgrams(words: string[]): Set<string> {
  const result = new Set(words)
  for (let index = 0; index < words.length - 1; index += 1) {
    result.add(words.slice(index, index + 2).join(' '))
  }
  for (let index = 0; index < words.length - 2; index += 1) {
    result.add(words.slice(index, index + 3).join(' '))
  }
  return result
}

function similarity(input: string, phrase: string): number {
  const cleanInput = normalise(input)
  const cleanPhrase = normalise(phrase)
  if (!cleanInput || !cleanPhrase) return 0
  if (cleanInput === cleanPhrase) return 1
  if (cleanPhrase.length > 5 && cleanInput.includes(cleanPhrase)) return 0.96

  const inputTokens = tokens(cleanInput)
  const phraseTokens = tokens(cleanPhrase)
  if (!inputTokens.length || !phraseTokens.length) return 0

  const inputTerms = makeNgrams(inputTokens)
  const phraseTerms = makeNgrams(phraseTokens)
  let overlap = 0
  for (const term of phraseTerms) {
    if (inputTerms.has(term)) overlap += term.includes(' ') ? 1.8 : 1
  }

  const denominator = Math.sqrt(inputTerms.size * phraseTerms.size)
  const cosineLike = denominator ? overlap / denominator : 0
  const coverage = overlap / Math.max(1, phraseTerms.size)
  return Math.min(1, cosineLike * 0.72 + coverage * 0.28)
}

export function hashIntentFeatures(message: string): string[] {
  const terms = makeNgrams(tokens(message))
  return [...terms].map((term) => createHash('sha256').update(term).digest('hex'))
}

export function classifyBigmazIntent(
  message: string,
  learnedExamples: IntentExample[] = [],
  learnedWeights: IntentWeight[] = [],
): IntentPrediction {
  const cleanMessage = normalise(message)
  const examples = [...BASE_EXAMPLES, ...learnedExamples]
  const scores = new Map<BigmazIntent, number>()

  for (const example of examples) {
    const score = similarity(cleanMessage, example.phrase)
    const current = scores.get(example.intent) ?? 0
    if (score > current) scores.set(example.intent, score)
  }

  const featureHashes = new Set(hashIntentFeatures(message))
  const adaptiveScores = new Map<BigmazIntent, number>()
  for (const item of learnedWeights) {
    if (featureHashes.has(item.feature_hash)) {
      adaptiveScores.set(item.intent_key, (adaptiveScores.get(item.intent_key) ?? 0) + item.weight)
    }
  }
  for (const [intent, adjustment] of adaptiveScores) {
    const boundedAdjustment = Math.max(-0.18, Math.min(0.24, adjustment / Math.max(2, featureHashes.size) * 0.35))
    scores.set(intent, Math.max(0, Math.min(1, (scores.get(intent) ?? 0) + boundedAdjustment)))
  }

  const cueGroups: Array<{ intent: BigmazIntent; phrases: string[]; score: number }> = [
    { intent: 'escrow_explanation', phrases: ['escrow', 'money held until', 'payment held until', 'release of funds'], score: 0.88 },
    { intent: 'roommate_search', phrases: ['roommate', 'room mate', 'flatmate', 'housemate', 'share rent', 'share accommodation'], score: 0.86 },
    { intent: 'neighbourhood_question', phrases: ['how is the neighbourhood', 'how is the neighborhood', 'what is the neighbourhood like', 'what is the neighborhood like', 'tell me about the neighbourhood', 'tell me about the neighborhood', 'electricity supply', 'water supply', 'road condition', 'is the area safe', 'peaceful area', 'flooding in the area'], score: 0.87 },
    { intent: 'service_search', phrases: ['electrician', 'plumber', 'plumbing', 'mechanic', 'carpenter', 'cleaning service', 'repair service'], score: 0.86 },
    { intent: 'product_search', phrases: ['laptop', 'mobile phone', 'smartphone', 'television', 'generator', 'furniture', 'electronics'], score: 0.84 },
    { intent: 'property_search', phrases: ['accommodation', 'apartment', 'bedsitter', 'self contained', 'self-contained', 'hostel', 'property to rent', 'room to rent', 'house for rent', 'house for sale'], score: 0.84 },
    { intent: 'support', phrases: ['contact support', 'customer care', 'speak to an administrator', 'submit a complaint', 'report a problem'], score: 0.9 },
    { intent: 'navigation', phrases: ['open my dashboard', 'where do i find', 'how do i open', 'open neighbourhood space', 'open neighborhood space'], score: 0.82 },
    { intent: 'greeting', phrases: ['hello', 'good morning', 'good afternoon', 'good evening'], score: 0.8 },
  ]
  for (const group of cueGroups) {
    if (group.phrases.some((phrase) => cleanMessage.includes(phrase))) {
      scores.set(group.intent, Math.max(scores.get(group.intent) ?? 0, group.score))
    }
  }

  const ranked = [...scores.entries()]
    .map(([intent, score]) => ({ intent, score }))
    .sort((left, right) => right.score - left.score)

  const first = ranked[0]
  const second = ranked[1]
  const confidence = first?.score ?? 0
  const margin = confidence - (second?.score ?? 0)

  // A conservative confidence floor prevents weak keyword overlap from
  // being presented as a confident understanding of the user's intent.
  const intent = confidence >= 0.22 && margin >= 0.025 ? first.intent : 'general'

  return {
    intent,
    confidence: Number(confidence.toFixed(4)),
    alternatives: ranked.slice(0, 3),
    modelVersion: MODEL_VERSION,
  }
}

export function countMeaningfulTokens(message: string): number {
  return tokens(message).length
}

export function getBigmazModelVersion(): string {
  return MODEL_VERSION
}
