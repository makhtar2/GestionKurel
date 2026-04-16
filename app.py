import streamlit as st
from streamlit_gsheets import GSheetsConnection
import pandas as pd
from datetime import datetime
import plotly.express as px

# Configuration de la page
st.set_page_config(
    page_title="Gestion Kourel Pro",
    page_icon="🎤",
    layout="wide"
)

# Connexion à Google Sheets
conn = st.connection("gsheets", type=GSheetsConnection)

# --- Fonctions de lecture des données ---
@st.cache_data(ttl=60)
def get_members_list():
    try:
        df_members = conn.read(worksheet="Membres", ttl="5m")
        if not df_members.empty and "Nom" in df_members.columns:
            return df_members["Nom"].dropna().sort_values().tolist()
    except:
        pass
    return ["Moussa Sow", "Abdoulaye Diallo", "Ibrahima Gueye", "Modou Fall", "Cheikh Ndiaye"]

@st.cache_data(ttl=60)
def get_attendance_data():
    try:
        df = conn.read(ttl="1m")
        if not df.empty:
            df['Date'] = pd.to_datetime(df['Date']).dt.date
        return df
    except:
        return pd.DataFrame(columns=["Date", "Membre", "Statut", "Commentaire"])

# Initialisation des données
MEMBRES_DYNAMIQUES = get_members_list()
df_main = get_attendance_data()

# --- BARRE LATÉRALE ---
st.sidebar.title("🎤 Kourel Menu")
menu = st.sidebar.radio("Navigation", ["🏠 Accueil & Stats", "📝 Faire le Pointage", "📊 Historique Complet"])

# --- SECTION : ACCUEIL & STATS ---
if menu == "🏠 Accueil & Stats":
    st.title("📈 Tableau de Bord des Présences")
    
    if not df_main.empty:
        # --- CALCULS DES KPIs ---
        total_sessions = len(df_main['Date'].unique())
        total_points = len(df_main)
        # Taux global (Présent + Retard)
        presences_count = len(df_main[df_main['Statut'].isin(["Présent", "Retard"])])
        taux_global = round((presences_count / total_points) * 100, 1) if total_points > 0 else 0
        
        # Affichage des KPIs
        col1, col2, col3 = st.columns(3)
        col1.metric("Total Séances", f"{total_sessions}")
        col2.metric("Taux de Présence Global", f"{taux_global}%")
        col3.metric("Membres Actifs", f"{len(MEMBRES_DYNAMIQUES)}")
        
        st.markdown("---")
        
        # --- GRAPHIQUE PAR MEMBRE ---
        st.subheader("Analyse par Membre")
        stats = df_main.copy()
        stats['Presence_Value'] = stats['Statut'].apply(lambda x: 1 if x in ["Présent", "Retard"] else 0)
        member_stats = stats.groupby('Membre').agg(
            Taux=('Presence_Value', 'mean'),
            Total=('Statut', 'count')
        ).reset_index()
        member_stats['Taux'] = (member_stats['Taux'] * 100).round(1)
        
        fig = px.bar(member_stats, x='Membre', y='Taux', 
                     title="Taux de présence (%) par membre",
                     color='Taux', color_continuous_scale='RdYlGn',
                     range_y=[0, 100])
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Bienvenue ! Commencez par enregistrer des présences pour voir les statistiques.")

# --- SECTION : POINTAGE ---
elif menu == "📝 Faire le Pointage":
    st.title("📝 Nouveau Pointage")
    
    # Sécurité simplifiée dans la sidebar
    if st.sidebar.text_input("Mot de passe", type="password") == st.secrets["password"]:
        with st.form("presence_form", clear_on_submit=True):
            c1, c2 = st.columns(2)
            with c1:
                date_p = st.date_input("Date", datetime.now())
                membre_p = st.selectbox("Choisir le membre", MEMBRES_DYNAMIQUES)
            with c2:
                statut_p = st.selectbox("Statut", ["Présent", "Absent", "Retard", "Excusé"])
                comment_p = st.text_input("Commentaire (optionnel)")
            
            if st.form_submit_button("✅ Enregistrer"):
                new_row = pd.DataFrame([{"Date": str(date_p), "Membre": membre_p, "Statut": statut_p, "Commentaire": comment_p}])
                updated_df = pd.concat([df_main, new_row], ignore_index=True)
                conn.update(data=updated_df)
                st.success(f"Enregistré : {membre_p} ({statut_p})")
                st.balloons()
                st.cache_data.clear() # Forcer la mise à jour
    else:
        st.warning("Entrez le mot de passe dans la barre latérale pour pointer.")

# --- SECTION : HISTORIQUE ---
elif menu == "📊 Historique Complet":
    st.title("📊 Historique des Présences")
    
    if not df_main.empty:
        # --- FILTRES ---
        col_f1, col_f2 = st.columns(2)
        with col_f1:
            f_membre = st.multiselect("Filtrer par Membre", options=MEMBRES_DYNAMIQUES)
        with col_f2:
            f_statut = st.multiselect("Filtrer par Statut", options=["Présent", "Absent", "Retard", "Excusé"])
        
        # Application des filtres
        df_filtered = df_main.copy()
        if f_membre:
            df_filtered = df_filtered[df_filtered['Membre'].isin(f_membre)]
        if f_statut:
            df_filtered = df_filtered[df_filtered['Statut'].isin(f_statut)]
            
        # Style pour le tableau
        def color_status(val):
            color = 'white'
            if val == 'Présent': color = '#90ee90' # Vert clair
            elif val == 'Absent': color = '#ffcccb' # Rouge clair
            elif val == 'Retard': color = '#ffe4b5' # Orange clair
            elif val == 'Excusé': color = '#e0e0e0' # Gris
            return f'background-color: {color}'

        st.dataframe(
            df_filtered.sort_values(by="Date", ascending=False).style.applymap(color_status, subset=['Statut']),
            use_container_width=True,
            height=500
        )
        
        # Export CSV
        csv = df_filtered.to_csv(index=False).encode('utf-8')
        st.download_button("📥 Télécharger l'historique (CSV)", csv, "presence_kourel.csv", "text/csv")
    else:
        st.info("L'historique est vide.")
