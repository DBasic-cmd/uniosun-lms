const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  course: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Course', 
    required: true 
  },
  lecturer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  frequency: { 
    type: String, 
    enum: ['once', 'weekly', 'monthly'], 
    default: 'once' 
  },
  recurrenceEndDate: {
    type: Date,
    required: function () { return this.frequency !== 'once'; },
    validate: {
      validator: function (value) {
        return this.frequency === 'once' ||
          (value && value >= this.date);
      },
      message: 'Recurrence end date must be on or after the event date.'
    }
  },
  locationType: { 
    type: String, 
    enum: ['online', 'physical'], 
    required: true 
  },
  locationDetails: { 
    type: String, 
    required: true 
    // e.g., "Google Meet Link" or "ETF Hall Room 4"
  },
  instruction: { type: String, trim: true },
  date: { type: Date, required: true },
  startTime: { type: String, required: true }, // e.g., "10:00 AM" or "14:00"
  endTime: { type: String, required: true }    // e.g., "12:00 PM" or "16:00"
}, { timestamps: true });

module.exports = mongoose.models.Event || mongoose.model('Event', eventSchema);