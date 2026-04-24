import pandas as pd
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score
import pickle
import matplotlib.pyplot as plt

print("🚀 Starting model training...")

# 🟢 Load cleaned data
df = pd.read_csv("cleaned_data.csv")
print("✅ Data loaded")

# 🟡 Features & target
X = df[['pm2_5', 'pm10', 'no2', 'co', 'temp_c', 'humidity', 'windspeed_kph']]
y = df['aqi_index']

print("✅ Features selected")

# 🔵 Train-test split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

print("✅ Data split done")

# 🟣 Train model
model = RandomForestRegressor(
    n_estimators=300,
    max_depth=15,
    min_samples_split=5,
    random_state=42
)

print("🤖 Training model...")
model.fit(X_train, y_train)
print("✅ Model trained")

# 🔴 Prediction
y_pred = model.predict(X_test)

# 📈 Accuracy
accuracy = r2_score(y_test, y_pred)
print("🎯 Test Accuracy (R2 Score):", accuracy)

# 🟢 CROSS-VALIDATION (NEW ADDITION)
print("🔁 Performing Cross-Validation...")
cv_scores = cross_val_score(model, X, y, cv=5)

print("📊 Cross-validation scores:", cv_scores)
print("📊 Average CV score:", cv_scores.mean())

# 💾 Save model
pickle.dump(model, open("model.pkl", "wb"))
print("💾 Model saved as model.pkl")

# 🧪 Sample prediction
sample = [[80, 150, 40, 700, 30, 60, 5]]
pred = model.predict(sample)
print("🔮 Sample Prediction (AQI):", pred[0])

# 📊 Feature importance
importance = model.feature_importances_
features = X.columns

plt.barh(features, importance)
plt.title("Feature Importance")
plt.xlabel("Importance")
plt.show()

print("🏁 All steps completed successfully!")