// Stub for side-effect-only ESM packages (e.g. chartjs-adapter-date-fns) that
// Jest/CRA cannot transform. The real module only registers a Chart.js date
// adapter, which is irrelevant in jsdom tests.
module.exports = {};
