import streamlit as st
from streamlit_gsheets import GSheetsConnection
import pandas as pd
from datetime import datetime

# Configuration de la page
st.set_page_config(
    page_title="Gestion des Présences Kourel",
    page_icon="🎤",
    layout="wide"
)

# Connexion à Google Sheets
conn = st.connection("gsheets", type=GSheetsConnection)

# --- Fonction de lecture des membres depuis l'onglet 'Membres' ---
def get_members_list():
    try:
        # On lit l'onglet 'Membres'
        df_members = conn.read(worksheet="Membres", ttl="5m")
        if not df_members.empty and "Nom" in df_members.columns:
            return df_members["Nom"].dropna().sort_values().tolist()
        else:
            return ["Ajoutez des noms dans l'onglet Membres"]
    except Exception:
        # Liste de secours si l'onglet n'existe pas encore
        return ["Erreur: Créez l'onglet 'Membres' avec une colonne 'Nom'"]

# Titre principal
st.title("🎤 Gestion de Présence Kourel")

# Chargement dynamique des membres
MEMBRES_DYNAMIQUES = get_members_list()

# Barre latérale pour la navigation
menu = st.sidebar.selectbox(
    "Menu",
    ["Pointage", "Historique", "Statistiques"]
)

# --- Fonction de lecture des données de présence ---
def get_data():
    try:
        # On lit l'onglet principal (par défaut le premier)
        return conn.read(ttl="1m")
    except Exception:
        return pd.DataFrame(columns=["Date", "Membre", "Statut", "Commentaire"])

# --- SECTION : POINTAGE ---
if menu == "Pointage":
    st.header("📝 Nouveau Pointage")
    
    # Sécurité : Vérification du mot de passe
    pwd_input = st.sidebar.text_input("Mot de passe administrateur", type="password")
    
    if pwd_input == st.secrets["password"]:
        with st.form("presence_form"):
            col1, col2 = st.columns(2)
            
            with col1:
                date_pointage = st.date_input("Date de répétition", datetime.now())
                membre_selected = st.selectbox("Membre", MEMBRES_DYNAMIQUES)
            
            with col2:
                statut_selected = st.selectbox(
                    "Statut",
                    ["Présent", "Absent", "Retard", "Excusé"]
                )
                commentaire = st.text_input("Commentaire (optionnel)")
            
            submit_button = st.form_submit_button("Enregistrer la présence")
            
            if submit_button:
                # Charger les données existantes
                df_existing = get_data()
                
                # Créer la nouvelle ligne
                new_row = pd.DataFrame([{
                    "Date": date_pointage.strftime("%Y-%m-%d"),
                    "Membre": membre_selected,
                    "Statut": statut_selected,
                    "Commentaire": commentaire
                }])
                
                # Fusionner et mettre à jour
                updated_df = pd.concat([df_existing, new_row], ignore_index=True)
                
                try:
                    conn.update(data=updated_df)
                    st.success(f"✅ Présence enregistrée pour {membre_selected} le {date_pointage}")
                    st.balloons()
                except Exception as e:
                    st.error(f"❌ Erreur lors de l'enregistrement : {e}")
    else:
        st.warning("Veuillez saisir le mot de passe correct dans la barre latérale pour accéder au formulaire de pointage.")

# --- SECTION : HISTORIQUE ---
elif menu == "Historique":
    st.header("📊 Historique des Présences")
    
    df = get_data()
    
    if not df.empty:
        # Tri par date décroissante
        df_display = df.sort_values(by="Date", ascending=False)
        st.dataframe(df_display, use_container_width=True)
    else:
        st.info("Aucune donnée enregistrée pour le moment.")

# --- SECTION : STATISTIQUES ---
elif menu == "Statistiques":
    st.header("📈 Statistiques par Membre")
    
    df = get_data()
    
    if not df.empty:
        # Calcul du taux de présence
        # On considère "Présent" et "Retard" comme des présences
        stats = df.copy()
        stats['Presence_Value'] = stats['Statut'].apply(lambda x: 1 if x in ["Présent", "Retard"] else 0)
        
        # Groupement par membre
        member_stats = stats.groupby('Membre').agg(
            Total_Sessions=('Statut', 'count'),
            Presences=('Presence_Value', 'sum')
        )
        
        member_stats['Taux de Présence (%)'] = (member_stats['Presences'] / member_stats['Total_Sessions'] * 100).round(2)
        
        # Affichage des statistiques
        st.dataframe(member_stats[['Total_Sessions', 'Presences', 'Taux de Présence (%)']], use_container_width=True)
        
        # Petit résumé graphique simple
        st.bar_chart(member_stats['Taux de Présence (%)'])
    else:
        st.info("Aucune statistique disponible pour le moment.")
