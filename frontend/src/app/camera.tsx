import { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Button,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { ActivityIndicator, Alert } from "react-native";
import { analyzeFoodImage } from "../services/api"; // Adjust path if needed

export default function CameraScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<string | null>(null);
  const cameraRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 1. Check for camera permissions
  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>
          We need your permission to show the camera
        </Text>
        <Button onPress={requestPermission} title="Grant Permission" />
      </View>
    );
  }

  // 2. Function to snap the photo
  const takePicture = async () => {
    if (cameraRef.current) {
      const options = { quality: 0.5, base64: true };
      const data = await cameraRef.current.takePictureAsync(options);
      setPhoto(data.uri);
    }
  };

 const handleAnalyzeFood = async () => {
  if (!photo) return;
  
  setIsLoading(true);
  try {
    const result = await analyzeFoodImage(photo);
    // Convert the array/object to a string so we can pass it through the router
    const ingredientsData = JSON.stringify(result);
    
    // Navigate to the new pantry screen and pass the data along
    router.push({
      pathname: '/pantry',
      params: { items: ingredientsData }
    });

  } catch (error) {
    Alert.alert("Error", "Could not connect to the backend.");
  } finally {
    setIsLoading(false);
  }
};

  // 3. If a photo is taken, show a preview
  if (photo) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: photo }} style={styles.camera} />
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setPhoto(null)}
          >
            <Text style={styles.buttonText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => console.log("Send to backend!")}
          >
            <Text style={styles.buttonText}>Analyze Food</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 4. Otherwise, show the live camera feed
  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" ref={cameraRef}>
        <View style={styles.overlay}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
          >
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
            <View style={styles.captureInner} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.primaryButton} 
            onPress={handleAnalyzeFood}
            disabled={isLoading}
            >
            {isLoading ? (
                <ActivityIndicator color="white" />
            ) : (
                <Text style={styles.buttonText}>Analyze Food</Text>
            )}
            </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#000",
  },
  text: {
    textAlign: "center",
    color: "white",
    marginBottom: 20,
  },
  camera: {
    flex: 1,
    width: "100%",
  },
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    paddingBottom: 40,
  },
  cancelButton: {
    position: "absolute",
    left: 30,
    bottom: 50,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "white",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 20,
    backgroundColor: "#000",
  },
  primaryButton: {
    backgroundColor: "#4CB963",
    padding: 15,
    borderRadius: 8,
    flex: 1,
    marginLeft: 10,
    alignItems: "center",
  },
  secondaryButton: {
    backgroundColor: "#333",
    padding: 15,
    borderRadius: 8,
    flex: 1,
    marginRight: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
});
