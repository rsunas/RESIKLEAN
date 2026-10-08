const fs = require('fs');

let code = fs.readFileSync('d:/RESIKLEAN/mobile/app/collector.tsx', 'utf8');

const importAlert = code.includes('Alert,');
if (!importAlert && !code.includes('Alert } from \'react-native\'')) {
  code = code.replace('} from \'react-native\';', ', Alert } from \'react-native\';');
}

// add states
code = code.replace(
  '  const [isHistoryDetailVisible, setIsHistoryDetailVisible] = useState(false);',
  '  const [isHistoryDetailVisible, setIsHistoryDetailVisible] = useState(false);\n  const [isSubmittingRoute, setIsSubmittingRoute] = useState(false);'
);

// add submit method
const submitMethod = `
  const submitRoute = async () => {
    if (!session?.token || !assignedRoute) return;
    Alert.alert(
      'Finish Route Collection',
      'Are you sure you want to finish the collection route for today? You will no longer be able to log stops for this route until your next scheduled day.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Finish Route', 
          style: 'destructive',
          onPress: async () => {
            setIsSubmittingRoute(true);
            try {
              const res = await fetch(\`\${API_URL}/collector/route/complete\`, {
                method: 'POST',
                headers: {
                  Authorization: \`Bearer \${session.token}\`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ routeId: assignedRoute._id })
              });
              const data = await res.json();
              if (!res.ok || !data.success) {
                Alert.alert('Error', data.error || 'Failed to submit route');
              } else {
                if (isGeofencingEnabled) {
                  await toggleGeofencing();
                }
                setAssignedRoute(null);
                void clearCachedAssignedRoute();
                Alert.alert('Success', 'Route completed for today!');
                loadRouteHistory(session.token);
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Network error');
            } finally {
              setIsSubmittingRoute(false);
            }
          }
        }
      ]
    );
  };
`;

code = code.replace('  const loadRouteHistory = useCallback(async (token: string) => {', submitMethod + '\n  const loadRouteHistory = useCallback(async (token: string) => {');

// add button in UI
const buttonUI = `
        {assignedRoute && (
          <Pressable 
            style={[styles.offlineMapButton, { backgroundColor: '#176b3a', marginTop: 15, marginBottom: 15 }]} 
            onPress={submitRoute}
            disabled={isSubmittingRoute}
          >
            <Text style={styles.offlineMapButtonText}>{isSubmittingRoute ? 'Submitting...' : 'Finish Route for Today'}</Text>
          </Pressable>
        )}
`;

code = code.replace(
  '          <ProgressRing percent={progressPercent} />\r\n        </Card>',
  '          <ProgressRing percent={progressPercent} />\r\n        </Card>' + buttonUI
);

// fallback for unix line endings
code = code.replace(
  '          <ProgressRing percent={progressPercent} />\n        </Card>',
  '          <ProgressRing percent={progressPercent} />\n        </Card>' + buttonUI
);


fs.writeFileSync('d:/RESIKLEAN/mobile/app/collector.tsx', code);
console.log('Modified collector.tsx');
