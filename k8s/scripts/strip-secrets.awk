# Filtra documentos Secret y StatefulSet del output de `kubectl kustomize`
# para que el pipeline aplique solo recursos no-secretos y no-estatales:
#   - el Secret real de prod NO debe sobrescribirse con los placeholders del repo
#   - el StatefulSet de postgres es inmutable en campos clave (serviceName,
#     volumeClaimTemplates...) y se gestiona aparte — nunca vía CI
#
# Uso: kubectl kustomize <overlay> | awk -f k8s/scripts/strip-secrets.awk | kubectl apply -f -
BEGIN { doc = ""; skip = 0 }
/^---/ {
    if (doc != "" && !skip) { printf "%s", doc }
    doc = "---\n"; skip = 0; next
}
{ doc = doc $0 "\n" }
/^kind: (Secret|StatefulSet)$/ { skip = 1 }
END { if (doc != "" && !skip) { printf "%s", doc } }
