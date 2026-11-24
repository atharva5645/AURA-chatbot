const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { classifyIntent, loadMLModel, getMLModelMeta } = require('../nlp/intentClassifier');
const { runTraining } = require('../ml/train');

const modelPath = path.join(__dirname, '..', 'ml', 'model.json');
const datasetPath = path.join(__dirname, '..', 'ml', 'dataset.json');

/**
 * GET /api/classifier/status
 * Get model status, vocabulary, training info
 */
router.get('/status', (req, res) => {
  try {
    const isModelPresent = fs.existsSync(modelPath);
    let modelData = null;
    let datasetCount = 0;

    if (fs.existsSync(datasetPath)) {
      const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
      datasetCount = dataset.length;
    }

    if (isModelPresent) {
      modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    }

    res.json({
      success: true,
      data: {
        isTrained: isModelPresent && !!modelData?.isTrained,
        datasetCount,
        classes: modelData?.classes || ['schedule_meeting', 'create_reminder', 'list_schedule', 'reschedule_meeting', 'cancel_meeting', 'greeting', 'help'],
        vocabularySize: modelData?.vocabulary?.length || 0,
        trainedAt: modelData?.trainedAt || null,
        evaluation: modelData?.evaluation || getMLModelMeta()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/classifier/train
 * Trigger local training
 */
router.post('/train', (req, res) => {
  try {
    const trainedModel = runTraining();
    loadMLModel(); // Reload into memory
    res.json({
      success: true,
      message: 'Model trained successfully on local dataset.',
      evaluation: trainedModel.evaluation
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/classifier/predict
 * Test intent classification on arbitrary text
 */
router.post('/predict', (req, res) => {
  try {
    const { text, mode = 'rule_based' } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: 'Text field is required.' });
    }

    const prediction = classifyIntent(text, mode);
    res.json({ success: true, text, mode, prediction });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
