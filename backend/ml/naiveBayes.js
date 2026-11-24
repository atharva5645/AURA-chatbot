/**
 * Multinomial Naive Bayes Classifier with N-gram Feature Extraction
 * Pure JavaScript implementation - zero external C++ / Python dependencies.
 * Fast, accurate, mathematically sound, and easy to explain during college project reviews.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'was',
  'be', 'been', 'with', 'by', 'about', 'from', 'as', 'into', 'like', 'through', 'after',
  'over', 'between', 'out', 'against', 'during', 'without', 'before', 'under', 'around',
  'among', 'can', 'you', 'could', 'would', 'please', 'i', 'me', 'my', 'we', 'our'
]);

class NaiveBayesClassifier {
  constructor(alpha = 1.0) {
    this.alpha = alpha; // Laplace smoothing parameter
    this.classes = [];
    this.classDocCounts = {};
    this.totalDocs = 0;
    this.vocabulary = new Set();
    this.wordCountsPerClass = {};
    this.totalWordsPerClass = {};
    this.isTrained = false;
  }

  /**
   * Tokenize text into unigrams and meaningful bigrams
   */
  tokenize(text) {
    const cleaned = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return [];

    const rawWords = cleaned.split(' ');
    const tokens = [];

    // Filtered words for unigrams
    for (const w of rawWords) {
      if (w.length > 1 && !STOP_WORDS.has(w)) {
        tokens.push(w);
      }
    }

    // Add bigrams to capture intent phrases like "schedule_meeting", "remind_me"
    for (let i = 0; i < rawWords.length - 1; i++) {
      const bigram = `${rawWords[i]}_${rawWords[i + 1]}`;
      tokens.push(bigram);
    }

    return tokens;
  }

  /**
   * Train the classifier on an array of { text, intent }
   */
  train(documents) {
    this.classes = Array.from(new Set(documents.map(d => d.intent)));
    this.totalDocs = documents.length;
    this.vocabulary = new Set();
    this.classDocCounts = {};
    this.wordCountsPerClass = {};
    this.totalWordsPerClass = {};

    for (const c of this.classes) {
      this.classDocCounts[c] = 0;
      this.wordCountsPerClass[c] = {};
      this.totalWordsPerClass[c] = 0;
    }

    for (const doc of documents) {
      const c = doc.intent;
      this.classDocCounts[c]++;
      const tokens = this.tokenize(doc.text);

      for (const token of tokens) {
        this.vocabulary.add(token);
        this.wordCountsPerClass[c][token] = (this.wordCountsPerClass[c][token] || 0) + 1;
        this.totalWordsPerClass[c]++;
      }
    }

    this.isTrained = true;
  }

  /**
   * Classify input text and return predicted intent with confidence
   */
  classify(text) {
    if (!this.isTrained || this.classes.length === 0) {
      return { intent: 'unknown', confidence: 0, scores: {} };
    }

    const tokens = this.tokenize(text);
    if (tokens.length === 0) {
      return { intent: 'unknown', confidence: 0, scores: {} };
    }

    const vocabSize = this.vocabulary.size;
    const logPosteriors = {};

    for (const c of this.classes) {
      // Prior probability P(C)
      const prior = Math.log(this.classDocCounts[c] / this.totalDocs);
      let likelihoodSum = 0;

      const totalWords = this.totalWordsPerClass[c];
      const denominator = totalWords + this.alpha * vocabSize;

      for (const token of tokens) {
        if (this.vocabulary.has(token)) {
          const count = this.wordCountsPerClass[c][token] || 0;
          // Laplace smoothed likelihood P(w | C)
          const likelihood = Math.log((count + this.alpha) / denominator);
          likelihoodSum += likelihood;
        }
      }

      logPosteriors[c] = prior + likelihoodSum;
    }

    // Apply Softmax with numerical stability to convert log probabilities to 0..1 confidence
    const maxLog = Math.max(...Object.values(logPosteriors));
    const expScores = {};
    let sumExp = 0;

    for (const c of this.classes) {
      const expVal = Math.exp(logPosteriors[c] - maxLog);
      expScores[c] = expVal;
      sumExp += expVal;
    }

    let bestClass = null;
    let highestProb = -1;
    const normalizedScores = {};

    for (const c of this.classes) {
      const prob = sumExp > 0 ? (expScores[c] / sumExp) : 0;
      normalizedScores[c] = Number(prob.toFixed(4));
      if (prob > highestProb) {
        highestProb = prob;
        bestClass = c;
      }
    }

    return {
      intent: bestClass,
      confidence: Number(highestProb.toFixed(4)),
      scores: normalizedScores
    };
  }

  /**
   * Serialize trained model to plain JSON object
   */
  toJSON() {
    return {
      alpha: this.alpha,
      classes: this.classes,
      classDocCounts: this.classDocCounts,
      totalDocs: this.totalDocs,
      vocabulary: Array.from(this.vocabulary),
      wordCountsPerClass: this.wordCountsPerClass,
      totalWordsPerClass: this.totalWordsPerClass,
      isTrained: this.isTrained,
      trainedAt: new Date().toISOString()
    };
  }

  /**
   * Restore model from JSON
   */
  fromJSON(data) {
    this.alpha = data.alpha || 1.0;
    this.classes = data.classes || [];
    this.classDocCounts = data.classDocCounts || {};
    this.totalDocs = data.totalDocs || 0;
    this.vocabulary = new Set(data.vocabulary || []);
    this.wordCountsPerClass = data.wordCountsPerClass || {};
    this.totalWordsPerClass = data.totalWordsPerClass || {};
    this.isTrained = data.isTrained || false;
    return this;
  }
}

module.exports = NaiveBayesClassifier;
