// ── peculio-app CI/CD Pipeline (patrón yambo, 2026-09) ─────────────────────
// Jenkins (k3s .22, solo ssh) → ssh BUILD_HOST (.21: docker + registry + kubeconfigs)
//   main/master → build + push → deploy PROD (Hetzner CX33, ns peculio)
//   otras ramas/PRs → pipeline verde sin build/deploy (solo main despliega)
//
// Credenciales Jenkins globales (mismas que yambo):
//   yambo-ssh-key          : SSH private key del usuario IPA 'build'
//   yambo-build-host       : "build@192.168.1.21"
//   yambo-registry-user    : usuario registry
//   yambo-registry-pass    : password registry
//   yambo-registry-host-prod : "100.111.131.248:5000" (registry .21 vía NetBird,
//                              el que el k3s de Hetzner ya tiene en registries.yaml)
// Kubeconfig Hetzner en BUILD_HOST: /home/build/.kube/hetzner.yaml

pipeline {
    agent any

    parameters {
        booleanParam(
            name: 'FORCE_PRODUCTION',
            defaultValue: false,
            description: 'Tratar la rama actual como producción (deploy a Hetzner)'
        )
        booleanParam(
            name: 'FORCE_DEPLOY',
            defaultValue: false,
            description: 'Construir y empujar imágenes aunque la rama no sea main'
        )
    }

    environment {
        SSH_KEY          = credentials('yambo-ssh-key')
        BUILD_HOST       = credentials('yambo-build-host')
        REGISTRY_USER    = credentials('yambo-registry-user')
        REGISTRY_PASS    = credentials('yambo-registry-pass')
        REGISTRY         = 'registry.cabrasky.net'
        BACKEND_IMAGE    = "${REGISTRY}/peculio-backend"
        FRONTEND_IMAGE   = "${REGISTRY}/peculio-frontend"
        NS_PROD          = 'peculio'
        APP_DOMAIN       = 'peculio.cabrasky.net'
        CI_DIR           = '/home/build/peculio-ci'
    }

    stages {
        stage('Checkout') {
            steps { checkout scm }
        }

        stage('Detect Branch & Tag') {
            steps {
                script {
                    env.IS_MAIN = (env.BRANCH_NAME == 'main' || env.BRANCH_NAME == 'master' || params.FORCE_PRODUCTION) ? 'true' : 'false'
                    env.APP_VERSION = sh(
                        script: "grep '\"version\"' frontend/package.json | head -1 | sed 's/.*\"version\": \"\\(.*\\)\".*/\\1/'",
                        returnStdout: true
                    ).trim()
                    env.GIT_SHORT = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                    if (env.IS_MAIN == 'true') {
                        env.IMAGE_TAG = "${env.APP_VERSION}-${env.GIT_SHORT}"
                    } else {
                        def slug = env.BRANCH_NAME.toLowerCase().replaceAll('[^a-z0-9]+', '-').replaceAll('^-+|-+$', '')
                        env.IMAGE_TAG = "branch-${slug}-${env.GIT_SHORT}"
                    }
                    echo "branch=${env.BRANCH_NAME} is_main=${env.IS_MAIN} tag=${env.IMAGE_TAG}"
                }
            }
        }

        stage('Prepare Build Host') {
            when {
                expression { env.IS_MAIN == 'true' || params.FORCE_DEPLOY }
            }
            steps {
                script {
                    sh """
                        ssh -o BatchMode=yes -o StrictHostKeyChecking=no -i ${SSH_KEY} ${BUILD_HOST} "rm -rf ${CI_DIR} && mkdir -p ${CI_DIR}"
                        tar czf - --exclude=.git --exclude=node_modules . | \\
                          ssh -o BatchMode=yes -o StrictHostKeyChecking=no -i ${SSH_KEY} ${BUILD_HOST} "tar xzf - -C ${CI_DIR}"
                    """
                }
            }
        }

        stage('Build & Push Images') {
            when {
                expression { env.IS_MAIN == 'true' || params.FORCE_DEPLOY }
            }
            steps {
                script {
                    sh """
                        ssh -o BatchMode=yes -o StrictHostKeyChecking=no -i ${SSH_KEY} ${BUILD_HOST} "
                            set -e
                            cd ${CI_DIR}
                            echo ${REGISTRY_PASS} | docker login ${REGISTRY} -u ${REGISTRY_USER} --password-stdin
                            docker build --build-arg GIT_SHA=${env.GIT_SHORT} -t ${BACKEND_IMAGE}:${env.IMAGE_TAG} -t ${BACKEND_IMAGE}:latest -f backend/Dockerfile backend/
                            docker build -t ${FRONTEND_IMAGE}:${env.IMAGE_TAG} -t ${FRONTEND_IMAGE}:latest -f frontend/Dockerfile frontend/
                            docker push ${BACKEND_IMAGE}:${env.IMAGE_TAG}
                            docker push ${BACKEND_IMAGE}:latest
                            docker push ${FRONTEND_IMAGE}:${env.IMAGE_TAG}
                            docker push ${FRONTEND_IMAGE}:latest
                        "
                    """
                }
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // Deploy — GitOps con Argo CD
        // ═══════════════════════════════════════════════════════════════════
        // El despliegue NO lo hace Jenkins. Jenkins solo construye y publica
        // imágenes a registry.cabrasky.net; Argo CD (homelab .22) vigila el
        // repo y despliega en Hetzner (ns peculio). Image Updater detecta el
        // tag nuevo y hace commit al repo → Argo CD sincroniza (sync manual).
        // Definición declarativa en: argocd/peculio.yaml
        stage('Deploy (GitOps · Argo CD)') {
            when {
                expression { env.IS_MAIN == 'true' }
            }
            steps {
                script {
                    echo "🚀 Imágenes publicadas en el registry (tag: ${env.IMAGE_TAG})."
                    echo "   El despliegue lo gestiona Argo CD → Application 'peculio' (sync manual)."
                    echo "   Argo CD Image Updater detectará el tag nuevo y actualizará el repo."
                    echo "   UI: https://argocd.cabrasky.net/applications/peculio"
                }
            }
        }
    }

    post {
        failure {
            echo '❌ Pipeline fallido — revisar logs'
        }
        success {
            script {
                if (env.IS_MAIN == 'true') {
                    echo "✅ peculio-app desplegado (${env.IMAGE_TAG}): https://${APP_DOMAIN}"
                } else {
                    echo "Rama ${env.BRANCH_NAME}: sin deploy (solo main despliega a producción)"
                }
            }
        }
    }
}
