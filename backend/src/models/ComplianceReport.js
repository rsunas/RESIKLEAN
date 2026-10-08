const mongoose = require('mongoose');

const complianceReportSchema = new mongoose.Schema({
  reportId: { type: String, required: true, unique: true },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reportPeriodStart: { type: Date, required: true },
  reportPeriodEnd: { type: Date, required: true },
  aggregatedMetrics: {
    totalTonnage: { type: Number, required: true },
    truckLoads: { type: Number, required: true },
  }
}, { timestamps: true });

module.exports = mongoose.model('ComplianceReport', complianceReportSchema);
