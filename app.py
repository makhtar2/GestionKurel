import streamlit as st
from streamlit_gsheets import GSheetsConnection
import pandas as pd
from datetime import datetime
import plotly.express as px

# Configuration de la page
st.set_page_config(
    page_title="Kourel Presence",
    page_icon="🎤",
    layout="wide"
)

# Style CSS pour améliorer l'expérience mobile (boutons plus grands, padding)
st.markdown("""
    <style>
    .stButton button {
        width: 100%;
        height: 3em;
        font-weight: bold;
    }
    [data-testid="stMetricValue"] {
        font-size: 25px;
    }
    </style>
    """, unsafe_allow_html=True)

# Connexion à Google Sheets
conn = st.connection("gsheets", type=GSheetsConnection)

# --- Fonctions de lecture ---
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

# Initialisation
MEMBRES_DYNAMIQUES = get_members_list()
df_main = get_attendance_data()

# --- NAVIGATION ---
menu = st.sidebar.selectbox("Aller à", ["🏠 Tableau de Bord", "✅ Faire l'Appel", "📊 Historique"])

# --- SECTION : ACCUEIL & STATS ---
if menu == "🏠 Tableau de Bord":
    st.title("🎤 Kourel Dashboard")
    
    if not df_main.empty:
        total_sessions = len(df_main['Date'].unique())
        presences_count = len(df_main[df_main['Statut'].isin(["Présent", "Retard"])])
        taux_global = round((presences_count / len(df_main)) * 100, 1) if len(df_main) > 0 else 0
        
        c1, c2, c3 = st.columns(3)
        c1.metric("Séances", total_sessions)
        c2.metric("Taux Global", f"{taux_global}%")
        c3.metric("Membres", len(MEMBRES_DYNAMIQUES))
        
        # Graphique simplifié
        stats = df_main.copy()
        stats['Val'] = stats['Statut'].apply(lambda x: 1 if x in ["Présent", "Retard"] else 0)
        m_stats = stats.groupby('Membre')['Val'].mean().reset_index()
        m_stats['Val'] = (m_stats['Val'] * 100).round(0)
        
        fig = px.bar(m_stats, x='Val', y='Membre', orientation='h', 
                     title="Taux de présence (%)", text='Val',
                     color='Val', color_continuous_scale='RdYlGn')
        fig.update_layout(xaxis_title="", yaxis_title="", showlegend=False)
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Aucune donnée disponible.")

# --- SECTION : FAIRE L'APPEL (OPTIMISÉ MOBILE) ---
elif menu == "✅ Faire l'Appel":
    st.title("✅ Faire l'Appel")
    
    if st.sidebar.text_input("Code Secret", type="password") == st.secrets["password"]:
        date_appel = st.date_input("Date du jour", datetime.now())
        
        st.info("Par défaut, tout le monde est 'Présent'. Modifiez uniquement les absents ou retards.")
        
        # Création d'un dictionnaire pour stocker les nouveaux statuts
        nouveaux_statuts = {}
        nouveaux_commentaires = {}
        
        # Liste des membres avec sélecteurs compacts
        for membre in MEMBRES_DYNAMIQUES:
            with st.container():
                col_name, col_statut = st.columns([2, 2])
                with col_name:
                    st.markdown(f"**{membre}**")
                with col_statut:
                    nouveaux_statuts[membre] = st.selectbox(
                        "Statut", 
                        ["Présent", "Absent", "Retard", "Excusé"], 
                        key=f"stat_{membre}",
                        label_visibility="collapsed"
                    )
                
                # Commentaire optionnel (caché dans un expander pour gagner de la place)
                with st.expander(f"Note pour {membre}"):
                    nouveaux_commentaires[membre] = st.text_input("Commentaire", key=f"com_{membre}")
            st.divider()

        if st.button("💾 ENREGISTRER L'APPEL COMPLET"):
            # Préparation des données pour l'envoi
            rows_to_add = []
            for membre in MEMBRES_DYNAMIQUES:
                rows_to_add.append({
                    "Date": str(date_appel),
                    "Membre": membre,
                    "Statut": nouveaux_statuts[membre],
                    "Commentaire": nouveaux_commentaires.get(membre, "")
                })
            
            new_data_df = pd.DataFrame(rows_to_add)
            updated_df = pd.concat([df_main, new_data_df], ignore_index=True)
            
            with st.spinner("Enregistrement en cours..."):
                conn.update(data=updated_df)
                st.success(f"Appel du {date_appel} enregistré avec succès !")
                st.balloons()
                st.cache_data.clear()
    else:
        st.warning("Veuillez entrer le mot de passe dans le menu latéral.")

# --- SECTION : HISTORIQUE ---
elif menu == "📊 Historique":
    st.title("📊 Historique")
    
    # Filtres compacts
    f_mem = st.multiselect("Filtrer Membre", MEMBRES_DYNAMIQUES)
    
    df_f = df_main.copy()
    if f_mem:
        df_f = df_f[df_f['Membre'].isin(f_mem)]
    
    st.dataframe(df_f.sort_values("Date", ascending=False), use_container_width=True)
