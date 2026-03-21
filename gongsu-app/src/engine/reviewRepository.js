function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }
}

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }
}

const REVIEW_STATUSES = new Set(["unreviewed", "confirm", "reject", "hold"]);

export function createCandidateReview(input) {
  assertObject(input, "candidateReview");
  assertNonEmptyString(input.candidateId, "candidateReview.candidateId");
  assertNonEmptyString(input.status, "candidateReview.status");

  if (!REVIEW_STATUSES.has(input.status)) {
    throw new Error("candidateReview.status is invalid.");
  }

  return {
    candidateId: input.candidateId,
    status: input.status,
    note: input.note ?? null,
    updatedAt: input.updatedAt ?? new Date().toISOString()
  };
}

export function createReviewSession(input) {
  assertObject(input, "reviewSession");
  assertNonEmptyString(input.scenarioId, "reviewSession.scenarioId");
  assertArray(input.reviews ?? [], "reviewSession.reviews");

  return {
    scenarioId: input.scenarioId,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    reviews: (input.reviews ?? []).map(createCandidateReview)
  };
}

export class ReviewRepository {
  constructor(options = {}) {
    if (!options.store) {
      throw new Error("ReviewRepository requires a store.");
    }

    this.store = options.store;
  }

  getReviewPath(scenarioId) {
    assertNonEmptyString(scenarioId, "scenarioId");
    return `engine-reviews/${scenarioId}.json`;
  }

  async readSession(scenarioId) {
    const document = await this.store.readDocument(this.getReviewPath(scenarioId)).catch(
      (error) => {
        if (error.code === "ENOENT") {
          return {
            payload: createReviewSession({
              scenarioId,
              reviews: []
            })
          };
        }

        throw error;
      }
    );

    return createReviewSession(document.payload);
  }

  async saveReview(input) {
    assertObject(input, "saveReview");
    assertNonEmptyString(input.scenarioId, "saveReview.scenarioId");
    const review = createCandidateReview(input.review);
    const session = await this.readSession(input.scenarioId);
    const existing = new Map(session.reviews.map((entry) => [entry.candidateId, entry]));
    existing.set(review.candidateId, review);
    const nextSession = createReviewSession({
      scenarioId: input.scenarioId,
      updatedAt: new Date().toISOString(),
      reviews: Array.from(existing.values())
    });

    await this.store.writeDocument(this.getReviewPath(input.scenarioId), nextSession);
    return nextSession;
  }
}
