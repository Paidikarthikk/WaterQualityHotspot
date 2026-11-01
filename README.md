# AquaScope — Water Quality Analytics (PS-65)

React + Tailwind frontend, FastAPI backend, and scikit-learn Isolation Forest anomaly screening.

**Dataset source:** Government of India, Data.gov.in — [Water Quality in India - 2013](https://data.gov.in/resources/water-quality-monitoring-india)

> The included `demo_water_quality.csv` contains illustrative records for previewing the app only. It is not the official dataset. The dashboard displays a demo banner until your processed real dataset is present.

## Structure
- `backend/data/raw/`: copy the original 36 CSVs here
- `backend/data/processed/`: created by the preparation script
- `backend/scripts/prepare_dataset.py`: merges, converts numeric columns, normalizes common state labels and infers category from filenames
- `backend/app/main.py`: FastAPI endpoints and ML anomaly detection
- `frontend/`: React/Vite/Tailwind dashboard

## 1. Prepare data (Windows PowerShell)
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python scripts/prepare_dataset.py
```
Copy all source CSVs into `backend/data/raw/` before running the preparation script. It creates `backend/data/processed/water_quality.csv`, preserves missing values, and does not modify original files.

## 2. Start backend
From `backend/`:
```powershell
uvicorn app.main:app --reload
```
API docs: http://127.0.0.1:8000/docs

## 3. Start frontend
Open a second terminal:
```powershell
cd frontend
npm install
npm run dev
```
Open the Vite URL, normally http://localhost:5173.

## ML notes
Isolation Forest identifies statistically unusual patterns; it does **not** confirm pollution or unsafe water. Missing values are imputed inside the ML pipeline. Validate results and use appropriate water-quality standards for any formal classification. The dataset is from 2013, not current monitoring data.

## Endpoints
`/api/health`, `/api/summary`, `/api/states`, `/api/state-summary`, `/api/water-body-summary`, `/api/records`, `/api/anomalies`

Before GitHub, avoid committing `.venv`, `node_modules`, or large raw data files unless required.
