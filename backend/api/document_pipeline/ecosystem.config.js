module.exports = {
  apps: [{
    name: 'document_pipeline',
    script: 'venv/bin/uvicorn',
    args: 'main:app --host 0.0.0.0 --port 8100',
    cwd: '/home/rossi/aims/backend/api/document_pipeline',
    env: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      MONGODB_URI: 'mongodb://localhost:27017',
      MONGODB_DB: 'docupload',
      FILE_BASE_PATH: '/data/files'
    }
  }]
};
