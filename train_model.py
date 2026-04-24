import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
import pickle

# -------------------------------
# Load dataset
# -------------------------------
data = pd.read_csv(r"C:\Users\SHREYA\Downloads\cleaned_data.csv")

# -------------------------------
# Select correct columns
# -------------------------------
X = data[["pm2_5", "pm10", "temp_c", "humidity", "windspeed_kph"]]
y = data["aqi_index"]

# -------------------------------
# Train-test split
# -------------------------------
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# -------------------------------
# Train model
# -------------------------------
model = RandomForestRegressor(n_estimators=100)
model.fit(X_train, y_train)

# -------------------------------
# Save model
# -------------------------------
with open("model.pkl", "wb") as f:
    pickle.dump(model, f)

print("✅ Model trained successfully!")