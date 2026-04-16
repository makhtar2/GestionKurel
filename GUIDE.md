# Guide de Configuration Google Sheets

Pour que l'application fonctionne, suivez ces étapes :

## 1. Création de la Google Sheet
1. Créez une nouvelle feuille de calcul sur Google Sheets.
2. Renommez la première feuille (onglet) en `Sheet1` (ou changez le nom dans le code `app.py`).
3. Ajoutez les en-têtes suivants sur la première ligne (A1 à D1) :
   - **Date**
   - **Membre**
   - **Statut**
   - **Commentaire**
4. Copiez l'URL complète de votre feuille de calcul (ex: `https://docs.google.com/spreadsheets/d/VOTRE_ID/edit#gid=0`).

## 2. Configuration de l'API Google (Service Account)
1. Allez sur la [Google Cloud Console](https://console.cloud.google.com/).
2. Créez un nouveau projet (ex: "Gestion Kourel").
3. Activez les API **Google Drive API** et **Google Sheets API**.
4. Allez dans **IHM et services > Identifiants**.
5. Cliquez sur **Créer des identifiants > Compte de service**.
6. Donnez-lui un nom, puis cliquez sur "Créer et continuer". Ignorez les rôles optionnels.
7. Une fois créé, cliquez sur l'e-mail du compte de service, puis sur l'onglet **Clés**.
8. Cliquez sur **Ajouter une clé > Créer une clé** et choisissez le format **JSON**. Téléchargez le fichier.
9. **TRÈS IMPORTANT :** Ouvrez votre Google Sheet et cliquez sur le bouton "Partager". Ajoutez l'e-mail de votre compte de service (celui qui finit par `.iam.gserviceaccount.com`) en tant qu'**Éditeur**.

## 3. Configuration des Secrets Streamlit
Ouvrez le fichier JSON téléchargé et copiez les valeurs dans votre fichier `.streamlit/secrets.toml` (ou dans la section "Secrets" sur Streamlit Cloud) :

```toml
[connections.gsheets]
spreadsheet = "L_URL_DE_VOTRE_FEUILLE"
type = "service_account"
project_id = "votre-project-id"
private_key_id = "votre-key-id"
private_key = "-----BEGIN PRIVATE KEY-----\nCONTENU_DE_VOTRE_CLE\n-----END PRIVATE KEY-----\n"
client_email = "votre-service-account@votre-project.iam.gserviceaccount.com"
client_id = "votre-client-id"
auth_uri = "https://accounts.google.com/o/oauth2/auth"
token_uri = "https://oauth2.googleapis.com/token"
auth_provider_x509_cert_url = "https://www.googleapis.com/oauth2/v1/certs"
client_x509_cert_url = "votre-cert-url"

password = "votre_mot_de_passe_choisi"
```

## 4. Personnalisation des membres
Dans le fichier `app.py`, modifiez la variable `MEMBRES_PAR_DEFAUT` pour y mettre la liste réelle de vos membres :
```python
MEMBRES_PAR_DEFAUT = [
    "Ahmad", "Ibrahima", "Moussa", "Fatou", ...
]
```
