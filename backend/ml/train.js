const fs = require('fs');
const path = require('path');
const NaiveBayesClassifier = require('./naiveBayes');

const datasetPath = path.join(__dirname, 'dataset.json');
const modelPath = path.join(__dirname, 'model.json');

function runTraining() {
  console.log('----------------------------------------------------');
  console.log('🤖 AURA Local NLP Engine: Training Naive Bayes Model');
  console.log('----------------------------------------------------');

  if (!fs.existsSync(datasetPath)) {
    console.error(`Dataset not found at ${datasetPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(datasetPath, 'utf8');
  const dataset = JSON.parse(raw);
  console.log(`Loaded ${dataset.length} training examples across intents.`);

  // 1. Cross-validation evaluation (5-fold)
  const folds = 5;
  const foldSize = Math.floor(dataset.length / folds);
  let totalCorrect = 0;

  // Shuffle dataset copy
  const shuffled = [...dataset].sort(() => 0.5 - Math.random());

  for (let f = 0; f < folds; f++) {
    const testSet = shuffled.slice(f * foldSize, (f + 1) * foldSize);
    const trainSet = [
      ...shuffled.slice(0, f * foldSize),
      ...shuffled.slice((f + 1) * foldSize)
    ];

    const cvClassifier = new NaiveBayesClassifier(1.0);
    cvClassifier.train(trainSet);

    for (const item of testSet) {
      const pred = cvClassifier.classify(item.text);
      if (pred.intent === item.intent) {
        totalCorrect++;
      }
    }
  }

  const cvAccuracy = ((totalCorrect / (foldSize * folds)) * 100).toFixed(2);
  console.log(`📊 5-Fold Cross Validation Accuracy: ${cvAccuracy}%`);

  // 2. Train on full dataset
  const finalClassifier = new NaiveBayesClassifier(1.0);
  finalClassifier.train(dataset);

  const modelData = finalClassifier.toJSON();
  modelData.evaluation = {
    cvAccuracy: `${cvAccuracy}%`,
    totalSamples: dataset.length,
    vocabularySize: modelData.vocabulary.length,
    classes: modelData.classes
  };

  fs.writeFileSync(modelPath, JSON.stringify(modelData, null, 2), 'utf8');
  console.log(`Model successfully serialized and saved to: ${modelPath}`);
  console.log(`Vocabulary size: ${modelData.vocabulary.length} tokens.`);
  console.log(`Recognized Intent Classes: ${modelData.classes.join(', ')}`);
  console.log('----------------------------------------------------\n');

  return modelData;
}

if (require.main === module) {
  runTraining();
}

module.exports = {
  runTraining
};
