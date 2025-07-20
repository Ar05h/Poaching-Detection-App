// Main React Native
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';          // For selecting images
import * as DocumentPicker from 'expo-document-picker';    // For selecting audio files
import * as Speech from 'expo-speech';                     // For text-to-speech
import * as Location from 'expo-location';                 // For getting GPS coordinates
import * as Print from 'expo-print';                       // For PDF export
import * as Sharing from 'expo-sharing';                   // For sharing the PDF
import MapView, { Marker, UrlTile, Callout } from 'react-native-maps'; // For map and markers

export default function App() {
  // State variables to track app data and UI state
  const [image, setImage] = useState(null);               // Holds selected image URI
  const [audioFile, setAudioFile] = useState(null);       // Holds selected audio file URI
  const [analysis, setAnalysis] = useState('');           // Text result from AI analysis
  const [uploading, setUploading] = useState(false);      // Upload status
  const [location, setLocation] = useState(null);         // Current user location
  const [errorMsg, setErrorMsg] = useState(null);         // Location error messages
  const [markerCoords, setMarkerCoords] = useState(null); // Coordinates for most recent upload
  const [showSplash, setShowSplash] = useState(true);     // Splash screen toggle
  const [markers, setMarkers] = useState([]);             // List of all sightings on the map
  const [filterType, setFilterType] = useState('image');  // Type filter for map markers
  const [filteredMarkers, setFilteredMarkers] = useState([]); // Filtered list of markers
  const [showReports, setShowReports] = useState(false);  // Toggle for report screen
  const [region, setRegion] = useState(null);             // Map viewport region

  // Show splash screen for 2 seconds on startup
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Ask for location permission and get current position
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);

      setRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    })();
  }, []);

  // Update visible markers based on current filter (image or audio)
  useEffect(() => {
    setFilteredMarkers(markers.filter((m) => m.type === filterType));
  }, [filterType, markers]);

  // Function to let the user pick an image
  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert('Permission to access media library is required!');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
      setAudioFile(null);
      Speech.stop();
      sendToBackend(result.assets[0], 'image');
    }
  };

  // Function to let the user pick an audio file
  const pickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const audio = result.assets[0];
        setAudioFile(audio.uri);
        setImage(null);
        Speech.stop();
        sendToBackend(audio, 'audio');
      }
    } catch (error) {
      console.error('Error picking audio file:', error);
    }
  };

  // Upload file to backend and process response
  const sendToBackend = async (file, type) => {
    setUploading(true);
    setAnalysis('');
    setMarkerCoords(null);

    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name || (type === 'audio' ? 'audiofile.wav' : 'image.jpg'),
      type:
        type === 'audio'
          ? file.mimeType === 'audio/vnd.wave' || file.type === 'audio/vnd.wave'
            ? 'audio/wav'
            : file.type || 'audio/wav'
          : 'image/jpeg',
    });

    // Include current GPS location
    if (location) {
      formData.append('latitude', String(location.latitude));
      formData.append('longitude', String(location.longitude));
    }

    // Choose appropriate backend endpoint
    let endpoint = type === 'image' ? 'analyze' : 'analyze-audio';

    try {
      const response = await fetch(`http://<YOUR_BACKEND_IP_OR_DOMAIN>:3000/${endpoint}`, {
        method: 'POST',
        body: formData,
      });

      const json = await response.json();
      const analysisText = json.analysis ?? json.error ?? 'No analysis returned.';
      setAnalysis(analysisText);
      Speech.speak(analysisText, { pitch: 1.1, rate: 1.0 });

      // Add marker if response includes location
      if (json.latitude && json.longitude) {
        const newMarker = {
          id: markers.length + 1,
          latitude: parseFloat(json.latitude),
          longitude: parseFloat(json.longitude),
          type,
          analysis: analysisText,
          uri: type === 'image' ? file.uri : null,
          timestamp: new Date().toLocaleString(),
        };

        const updatedMarkers = [...markers, newMarker];
        setMarkers(updatedMarkers);

        setRegion({
          latitude: newMarker.latitude,
          longitude: newMarker.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        });

        setMarkerCoords({ latitude: newMarker.latitude, longitude: newMarker.longitude });
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setAnalysis('Error uploading file.');
      Speech.speak('Error uploading file.');
    }
    setUploading(false);
  };

  // Export all marker data into a shareable PDF
  const exportPDF = async () => {
    if (markers.length === 0) {
      alert('No reports to export.');
      return;
    }

    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial; padding: 20px; }
            h1 { color: black; }
            .report {
              border-bottom: 1px solid #ccc;
              margin-bottom: 20px;
              padding-bottom: 10px;
            }
            .title { font-weight: bold; font-size: 18px; }
            .text { margin: 4px 0; }
          </style>
        </head>
        <body>
          <h1>Wildlife Sightings Report</h1>
          ${markers.map(marker => `
            <div class="report">
              <div class="title">${marker.type === 'image' ? 'Image Report' : 'Audio Report'}</div>
              <div class="text">🕒 ${marker.timestamp}</div>
              <div class="text">📍 ${marker.latitude.toFixed(5)}, ${marker.longitude.toFixed(5)}</div>
              <div class="text">${marker.analysis}</div>
            </div>
          `).join('')}
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri);
    } catch (error) {
      console.error('Failed to export PDF:', error);
      alert('Error exporting PDF.');
    }
  };

  // Splash screen when app loads
  if (showSplash) {
    return (
      <View style={styles.splashContainer}>
        <Text style={styles.splashTitle}>Wildlife Poaching Detection System</Text>
        <Text style={styles.splashSubtitle}>Helping Rangers Protect Nature</Text>
      </View>
    );
  }

  // Reports screen to show all past uploads
  if (showReports) {
    return (
      <View style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <Text style={styles.title}>All Reports</Text>

          {markers.length === 0 ? (
            <Text style={{ textAlign: 'center', marginTop: 20 }}>
              No reports yet.
            </Text>
          ) : (
            markers.map((marker) => (
              <View key={marker.id} style={styles.reportItem}>
                <Text style={styles.reportDate}>{marker.timestamp}</Text>
                <Text style={styles.reportType}>
                  {marker.type === 'image' ? 'Image Report' : 'Audio Report'}
                </Text>
                <Text style={styles.reportAnalysis}>{marker.analysis}</Text>
                {marker.uri && (
                  <Image
                    source={{ uri: marker.uri }}
                    style={styles.reportImage}
                    resizeMode="contain"
                  />
                )}
                <Text style={styles.reportLocation}>
                  Location: {marker.latitude.toFixed(5)}, {marker.longitude.toFixed(5)}
                </Text>
              </View>
            ))
          )}

          <TouchableOpacity
            style={[styles.button, { marginTop: 20 }]}
            onPress={exportPDF}
          >
            <Text style={styles.buttonText}>Export PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { marginTop: 10 }]}
            onPress={() => setShowReports(false)}
          >
            <Text style={styles.buttonText}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // Main app interface (upload, map, analysis)
  return (
    <View style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>Wildlife Poaching Detection System</Text>

        {location ? (
          <Text style={styles.locationText}>
            Latitude: {location.latitude.toFixed(5)}, Longitude: {location.longitude.toFixed(5)}
          </Text>
        ) : (
          <Text>{errorMsg || 'Fetching location...'}</Text>
        )}

        {/* Upload buttons */}
        <TouchableOpacity style={styles.button} onPress={pickImage}>
          <Text style={styles.buttonText}>Upload Animal Image</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={pickAudio}>
          <Text style={styles.buttonText}>Upload Audio File</Text>
        </TouchableOpacity>

        {uploading && <Text style={{ marginVertical: 10 }}>Analyzing...</Text>}
        {!!analysis && <Text style={styles.analysisText}>{analysis}</Text>}

        {/* Map with markers */}
        {location && region && (
          <MapView
            style={styles.map}
            region={region}
            showsUserLocation={true}
            showsMyLocationButton={true}
            mapType="none"
            onRegionChangeComplete={(reg) => setRegion(reg)}
          >
            <UrlTile
              urlTemplate="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maximumZ={19}
            />
            {filteredMarkers.map(marker => (
              <Marker
                key={marker.id}
                coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
                pinColor={marker.type === 'audio' ? 'blue' : 'red'}
              >
                <Callout>
                  <View style={{ maxWidth: 250 }}>
                    <Text style={{ fontWeight: 'bold' }}>
                      {marker.type === 'image' ? 'Animal Image' : 'Audio Recording'}
                    </Text>
                    <Text>{marker.analysis}</Text>
                    <Text style={{ fontSize: 12, color: 'gray' }}>{marker.timestamp}</Text>
                    {marker.uri && (
                      <Image source={{ uri: marker.uri }} style={{ width: 200, height: 150, marginTop: 5 }} />
                    )}
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>
        )}

        {/* Filter toggle buttons */}
        <View style={styles.filterBox}>
          {['image', 'audio'].map(type => (
            <TouchableOpacity
              key={type}
              style={[
                styles.filterButton,
                filterType === type && styles.filterButtonActive,
              ]}
              onPress={() => setFilterType(type)}
            >
              <Text
                style={[
                  styles.filterText,
                  filterType === type && styles.filterTextActive,
                ]}
              >
                {type.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* View reports button */}
        <TouchableOpacity style={[styles.button, { marginTop: 20 }]} onPress={() => setShowReports(true)}>
          <Text style={styles.buttonText}>View Reports</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// Style definitions for all screens and components
const styles = StyleSheet.create({
  // Splash screen container (centered with green background)
  splashContainer: {
    flex: 1,
    backgroundColor: '#4caf50',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Title text for splash screen
  splashTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  // Subtitle text for splash screen
  splashSubtitle: {
    fontSize: 16,
    color: 'white',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  // Background
  safeArea: {
    flex: 1,
    backgroundColor: '#eaf4ea', // light green tint
  },

  // ScrollView container padding
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },

  // App screen title
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 10,
    marginTop: 40,
  },

  // Current location text style
  locationText: {
    marginBottom: 20,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Shared button style
  button: {
    backgroundColor: '#4caf50',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginVertical: 10,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 1, height: 2 },
  },

  // Text inside buttons
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },

  // Display for AI-generated analysis
  analysisText: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },

  // Map view styling
  map: {
    height: 350,
    marginTop: 15,
    borderRadius: 10,
  },

  // Container for filter buttons
  filterBox: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#4caf50',
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 15,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    gap: 15,
  },

  // Individual filter button
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#4caf50',
  },

  // Active filter button (green background)
  filterButtonActive: {
    backgroundColor: '#4caf50',
  },

  // Default filter text
  filterText: {
    color: '#4caf50',
    fontWeight: 'bold',
  },

  // Filter text when selected
  filterTextActive: {
    color: 'white',
  },

  // Report page 
  reportItem: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },

  // Report timestamp
  reportDate: {
    fontSize: 12,
    color: 'gray',
    marginBottom: 5,
  },

  // Report type (image/audio)
  reportType: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 5,
  },

  // AI analysis text for report
  reportAnalysis: {
    marginBottom: 8,
    fontStyle: 'italic',
  },

  // Image inside report
  reportImage: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    marginBottom: 8,
  },

  // Coordinates text in report
  reportLocation: {
    fontSize: 14,
    color: '#333',
  },
});