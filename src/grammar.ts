import {
    Person,
    Tense,
    GrammaticalCase,
    PRONOUNS,
    THIRD_PERSON_SINGULAR_VARIANTS,
    TO_BE,
    PERSON_SUFFIXES,
    TENSE_MARKERS,
    NOUN_CASE_SUFFIXES,
    GENDER_SUFFIXES,
    VerbClass
} from "./lexicon";

const VOWELS = new Set(["a", "e", "i", "o", "u", "æ", "ø", "ə", "í", "î"]);

function isVowel(ch: string | undefined): boolean {
    return ch !== undefined && VOWELS.has(ch.toLowerCase());
}

function attachWithContraction(stem: string, suffix: string): string {
    if (!suffix) return stem;
    const stemLast = stem.slice(-1);
    const suffixFirst = suffix.slice(0, 1);
    if (isVowel(stemLast) && isVowel(suffixFirst) && stemLast.toLowerCase() === suffixFirst.toLowerCase()) {
        return stem.slice(0, -1) + suffix;
    }
    return stem + suffix;
}

export interface ConjugationRequest {
    root: string;
    verbClass: VerbClass;
    person: Person;
    tense: Tense;
}

export function conjugateVerb(req: ConjugationRequest): string {
    if (req.verbClass === "irregular") {
        return req.root;
    }

    const personSuffix = PERSON_SUFFIXES[req.person];
    const tenseMarker = TENSE_MARKERS[req.tense];

    let form = attachWithContraction(req.root, personSuffix);
    form = attachWithContraction(form, tenseMarker);
    return form;
}

export function conjugateToBe(person: Person, tense: Tense): string {
    return TO_BE[person][tense];
}

export type ThirdPersonGender = "masc" | "fem" | "neutral" | "nonliving";

export function resolvePronoun(
    person: Person,
    grammaticalCase: GrammaticalCase,
    options?: { formal?: boolean; gender?: ThirdPersonGender }
): string {
    if (person === "3sg") {
        const gender = options?.gender ?? "neutral";
        return THIRD_PERSON_SINGULAR_VARIANTS[gender][grammaticalCase];
    }

    if (person === "2sg" && options?.formal) {
        return PRONOUNS["2sg_formal"][grammaticalCase];
    }
    return PRONOUNS[person][grammaticalCase];
}

export type GrammaticalNumber = "singular" | "plural";

export function pluralizeNoun(root: string): string {
    if (root.endsWith("a")) {
        return root.slice(0, -1) + "æw";
    }
    return root + "ew";
}

export interface NounDeclensionRequest {
    root: string;
    number: GrammaticalNumber;
    grammaticalCase: GrammaticalCase;
    gender?: "masc" | "fem" | "neutral" | "sacred";
    isLiving: boolean;
}

export function declineNoun(req: NounDeclensionRequest): string {
    let form = req.number === "plural" ? pluralizeNoun(req.root) : req.root;

    if (req.isLiving && req.gender) {
        form = attachWithContraction(form, GENDER_SUFFIXES[req.gender]);
    }

    const caseSuffix = NOUN_CASE_SUFFIXES[req.grammaticalCase];
    form = attachWithContraction(form, caseSuffix);
    return form;
}

export type AdjectivePosition = "attributive" | "predicate";

export interface AdjectiveAgreementRequest {
    root: string;
    position: AdjectivePosition;
    gender?: "masc" | "fem" | "neutral" | "sacred";
    nounIsLiving: boolean;
    number: GrammaticalNumber;
}

export function agreeAdjective(req: AdjectiveAgreementRequest): string {
    if (req.position === "predicate") {
        return req.root;
    }

    if (!req.nounIsLiving) {
        return req.root;
    }

    if (req.number === "singular") {
        if (!req.gender) return req.root;
        return attachWithContraction(req.root, GENDER_SUFFIXES[req.gender]);
    }

    if (!req.gender) {
        return attachWithContraction(req.root, "ew");
    }
    const withGender = attachWithContraction(req.root, GENDER_SUFFIXES[req.gender]);
    return attachWithContraction(withGender, "ew");
}

export type NegationPlacement = "before" | "after";
export function negationPlacement(formal: boolean): NegationPlacement {
    return formal ? "after" : "before";
}

export function deriveAgentNoun(verbRoot: string): string {
    return attachWithContraction(verbRoot, "øn");
}
export function deriveAdjective(nounOrRoot: string): string {
    return attachWithContraction(nounOrRoot, "æl");
}
export function deriveSuperlative(adjectiveRoot: string): string {
    return attachWithContraction(adjectiveRoot, "tæ");
}
export function deriveSpeciesForm(root: string): string {
    return attachWithContraction(root, "í");
}
export function deriveLanguageName(root: string): string {
    return attachWithContraction(root, "kin");
}
export function deriveFormalVariant(root: string): string {
    return attachWithContraction(root, "a");
}