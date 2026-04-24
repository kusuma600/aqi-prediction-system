from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import pickle
import numpy as np

app = FastAPI()

# Allow frontend connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model
with open("model.pkl", "rb") as f:
    model = pickle.load(f)

# AQI category
def get_category(aqi):
    if aqi <= 50: return "Good"
    elif aqi <= 100: return "Moderate"
    elif aqi <= 200: return "Poor"
    else: return "Hazardous"

# API
@app.post("/predict")
def predict(data: dict):

    input_data = np.array([[
        data["pm25"],
        data["pm10"],
        data["temp"],
        data["humidity"],
        data["wind"]
    ]])

    pred = model.predict(input_data)[0]

    return {
        "aqi": float(pred),
        "category": get_category(pred)
    }