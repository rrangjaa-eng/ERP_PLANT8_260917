{
  "displayName": "[__ENV__] Cloud SQL backup failed",
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ["__CHANNEL__"],
  "alertStrategy": {
    "notificationRateLimit": { "period": "3600s" }
  },
  "conditions": [
    {
      "displayName": "Cloud SQL backup failed",
      "conditionMatchedLog": {
        "filter": "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"__PROJECT__:__INSTANCE__\" AND (protoPayload.methodName=~\"backup\" OR jsonPayload.message=~\"backup\") AND severity>=ERROR"
      }
    }
  ]
}
